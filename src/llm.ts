import type { DraftSet, RemovalContext } from './types.js';
import { buildPrompt } from './prompts.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

export class LlmError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LlmError';
    this.cause = cause;
  }
}

export async function draftRemovalReplies(
  apiKey: string,
  ctx: RemovalContext,
): Promise<DraftSet> {
  if (!apiKey) {
    throw new LlmError('Anthropic API key not configured in app settings.');
  }

  const { system, user } = buildPrompt(ctx);

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '<no body>');
    throw new LlmError(`Anthropic API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content?.find((b) => b.type === 'text')?.text;
  if (!textBlock) {
    throw new LlmError('Anthropic returned no text content.');
  }

  const parsed = parseDraftJson(textBlock);
  validateDrafts(parsed, ctx);
  return parsed;
}

function parseDraftJson(raw: string): DraftSet {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new LlmError('LLM output contained no JSON object.');
  }
  const json = trimmed.slice(start, end + 1);
  try {
    const obj = JSON.parse(json) as DraftSet;
    if (!obj.firm?.text || !obj.educational?.text || !obj.friendly?.text) {
      throw new LlmError('LLM output missing one of firm/educational/friendly drafts.');
    }
    return obj;
  } catch (err) {
    throw new LlmError('LLM output failed JSON parse.', err);
  }
}

function validateDrafts(drafts: DraftSet, ctx: RemovalContext): void {
  const validRuleNames = new Set(ctx.rules.map((r) => r.shortName.toLowerCase()));
  for (const tone of ['firm', 'educational', 'friendly'] as const) {
    const d = drafts[tone];
    if (d.text.length > 600) {
      d.text = d.text.slice(0, 600) + '…';
    }
    if (
      ctx.rules.length > 0 &&
      d.citedRule &&
      !validRuleNames.has(d.citedRule.toLowerCase())
    ) {
      d.citedRule = ctx.rules[0]?.shortName ?? '';
    }
    const banned = /\b(AI|ModNote|automated|generated)\b/gi;
    d.text = d.text.replace(banned, '').replace(/\s{2,}/g, ' ').trim();
  }
}
