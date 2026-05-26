import { Devvit } from '@devvit/public-api';
import type { Context, FormOnSubmitEvent, JSONObject, MenuItemOnPressEvent, Rule } from '@devvit/public-api';
import { draftRemovalReplies, LlmError } from './llm.js';
import type { DraftSet, RemovalContext, SubredditRule, Tone } from './types.js';

interface ReviewFormData extends JSONObject {
  [key: string]: import('@devvit/public-api').JSONValue;
  drafts: DraftSet;
  thingId: string;
  thingType: 'post' | 'comment';
}

Devvit.configure({ redditAPI: true, redis: true, http: true });

const TONES: Array<{ label: string; value: Tone }> = [
  { label: 'Firm — short, no softening', value: 'firm' },
  { label: 'Educational — explain why', value: 'educational' },
  { label: 'Friendly — warm, invite to retry', value: 'friendly' },
];

Devvit.addSettings([
  {
    name: 'anthropicApiKey',
    label: 'Anthropic API key',
    type: 'string',
    isSecret: true,
    scope: 'app',
    helpText:
      'Used to draft removal explanations. Get one at console.anthropic.com. Stored encrypted; not visible after save.',
  },
  {
    name: 'defaultTone',
    label: 'Default tone',
    type: 'select',
    scope: 'installation',
    options: TONES.map((t) => ({ label: t.label, value: t.value })),
    defaultValue: ['educational'],
    helpText: 'Tone preselected in the modal. Moderators can override per removal.',
  },
  {
    name: 'dailyQuotaPerMod',
    label: 'Daily draft quota per moderator',
    type: 'number',
    scope: 'installation',
    defaultValue: 50,
    helpText: 'Cap on drafts/day per mod to control LLM costs. 0 = unlimited.',
  },
  {
    name: 'appendSignature',
    label: 'Append "— mods of r/<sub>" signature',
    type: 'boolean',
    scope: 'installation',
    defaultValue: false,
  },
]);

async function loadRules(
  context: Context,
  subredditName: string,
): Promise<SubredditRule[]> {
  try {
    const rules = await context.reddit.getRules(subredditName);
    return rules.map((r: Rule) => ({
      shortName: r.shortName ?? r.priority?.toString() ?? 'rule',
      description: r.description ?? r.descriptionHtml ?? '',
      violationReason: r.violationReason ?? undefined,
    }));
  } catch {
    return [];
  }
}

async function checkAndIncrementQuota(
  context: Context,
  modUsername: string,
  quota: number,
): Promise<{ allowed: boolean; remaining: number }> {
  if (quota <= 0) return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  const dayKey = new Date().toISOString().slice(0, 10);
  const key = `modnote:quota:${modUsername}:${dayKey}`;
  const used = (await context.redis.incrBy(key, 1)) ?? 1;
  await context.redis.expire(key, 60 * 60 * 36);
  return { allowed: used <= quota, remaining: Math.max(0, quota - used) };
}

const reviewForm = Devvit.createForm(
  (data) => {
    const typed = data as unknown as ReviewFormData;
    const drafts = typed.drafts;
    return {
      title: 'ModNote — pick a draft to send',
      acceptLabel: 'Remove and reply',
      cancelLabel: 'Cancel',
      fields: [
        {
          name: 'tone',
          label: 'Draft to send',
          type: 'select',
          required: true,
          defaultValue: ['educational'],
          options: [
            { label: `Firm — cites "${drafts.firm.citedRule}"`, value: 'firm' },
            { label: `Educational — cites "${drafts.educational.citedRule}"`, value: 'educational' },
            { label: `Friendly — cites "${drafts.friendly.citedRule}"`, value: 'friendly' },
          ],
        },
        {
          name: 'firmPreview',
          label: 'Firm draft',
          type: 'paragraph',
          defaultValue: drafts.firm.text,
          helpText: 'Edit if needed. Only the selected tone will be sent.',
        },
        {
          name: 'educationalPreview',
          label: 'Educational draft',
          type: 'paragraph',
          defaultValue: drafts.educational.text,
        },
        {
          name: 'friendlyPreview',
          label: 'Friendly draft',
          type: 'paragraph',
          defaultValue: drafts.friendly.text,
        },
        { name: 'thingId', label: '', type: 'string', defaultValue: typed.thingId },
        { name: 'thingType', label: '', type: 'string', defaultValue: typed.thingType },
      ],
    } as const;
  },
  async (event: FormOnSubmitEvent<JSONObject>, context: Context) => {
    const toneRaw = event.values.tone;
    const tone: Tone = (Array.isArray(toneRaw) ? toneRaw[0] : toneRaw) as Tone ?? 'educational';
    const thingId = String(event.values.thingId ?? '');
    const thingType = (event.values.thingType === 'comment' ? 'comment' : 'post') as 'post' | 'comment';
    const draftKey = `${tone}Preview`;
    let text = String(event.values[draftKey] ?? '');

    const append = await context.settings.get<boolean>('appendSignature');
    if (append) {
      const sub = await context.reddit.getSubredditById(context.subredditId);
      if (sub) {
        text += `\n\n— mods of r/${sub.name}`;
      }
    }

    try {
      if (thingType === 'post') {
        const reply = await context.reddit.submitComment({ id: thingId, text });
        await reply.distinguish(true);
        const post = await context.reddit.getPostById(thingId);
        await post.remove(false);
      } else {
        const target = await context.reddit.getCommentById(thingId);
        const reply = await context.reddit.submitComment({ id: target.postId, text });
        await reply.distinguish(true);
        await target.remove(false);
      }
      context.ui.showToast({
        text: `Removed with ModNote — ${tone} reply posted.`,
        appearance: 'success',
      });
      await context.redis.incrBy('modnote:metrics:totalRemovals', 1);
      await context.redis.incrBy(`modnote:metrics:tone:${tone}`, 1);
    } catch (err) {
      context.ui.showToast({
        text: `ModNote failed: ${(err as Error).message}`,
        appearance: 'neutral',
      });
    }
  },
);

async function handleRemoveWithModNote(
  thingType: 'post' | 'comment',
  event: MenuItemOnPressEvent,
  context: Context,
): Promise<void> {
  const apiKey = await context.settings.get<string>('anthropicApiKey');
  if (!apiKey) {
    context.ui.showToast({
      text: 'ModNote: set Anthropic API key in app settings first.',
      appearance: 'neutral',
    });
    return;
  }

  const quota = (await context.settings.get<number>('dailyQuotaPerMod')) ?? 50;
  const me = await context.reddit.getCurrentUser();
  const myName = me?.username ?? 'unknown-mod';
  const quotaCheck = await checkAndIncrementQuota(context, myName, quota);
  if (!quotaCheck.allowed) {
    context.ui.showToast({
      text: `ModNote: daily quota of ${quota} reached. Resets at 00:00 UTC.`,
      appearance: 'neutral',
    });
    return;
  }

  context.ui.showToast({ text: 'ModNote: drafting…' });

  let title = '';
  let body = '';
  let authorName = 'unknown';
  if (thingType === 'post') {
    const post = await context.reddit.getPostById(event.targetId);
    title = post.title ?? '';
    body = post.body ?? '';
    authorName = post.authorName ?? 'unknown';
  } else {
    const comment = await context.reddit.getCommentById(event.targetId);
    body = comment.body ?? '';
    authorName = comment.authorName ?? 'unknown';
  }

  const sub = await context.reddit.getSubredditById(context.subredditId);
  const subredditName = sub?.name ?? '';
  const rules = subredditName ? await loadRules(context, subredditName) : [];

  const ctx: RemovalContext = {
    thingId: event.targetId,
    thingType,
    title,
    body,
    authorName,
    subredditName,
    rules,
  };

  let drafts: DraftSet;
  try {
    drafts = await draftRemovalReplies(apiKey, ctx);
  } catch (err) {
    const msg =
      err instanceof LlmError ? err.message : (err as Error).message ?? 'unknown';
    context.ui.showToast({
      text: `ModNote draft failed: ${msg}`,
      appearance: 'neutral',
    });
    return;
  }

  const formData: ReviewFormData = {
    drafts,
    thingId: event.targetId,
    thingType,
  };
  context.ui.showForm(reviewForm, formData);
}

Devvit.addMenuItem({
  label: 'Remove with ModNote',
  location: 'post',
  forUserType: 'moderator',
  onPress: (event, context) => handleRemoveWithModNote('post', event, context),
});

Devvit.addMenuItem({
  label: 'Remove with ModNote',
  location: 'comment',
  forUserType: 'moderator',
  onPress: (event, context) => handleRemoveWithModNote('comment', event, context),
});

Devvit.addMenuItem({
  label: 'ModNote stats',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const total = (await context.redis.get('modnote:metrics:totalRemovals')) ?? '0';
    const firm = (await context.redis.get('modnote:metrics:tone:firm')) ?? '0';
    const edu = (await context.redis.get('modnote:metrics:tone:educational')) ?? '0';
    const fri = (await context.redis.get('modnote:metrics:tone:friendly')) ?? '0';
    context.ui.showToast({
      text: `ModNote: ${total} removals · firm ${firm} · edu ${edu} · friendly ${fri}`,
    });
  },
});

export default Devvit;
