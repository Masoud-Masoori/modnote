import type { RemovalContext, SubredditRule } from './types.js';

const TONE_GUIDE = {
  firm: `Be direct and unambiguous. State the rule violated and the consequence.
No softening hedges. No "I understand but..." Two short sentences max.`,
  educational: `Explain WHY the rule exists, not just that it was broken. Reference
the rule by name and quote the part the post violated. Suggest how to repost
correctly. Three to four sentences.`,
  friendly: `Acknowledge the user's intent positively before explaining the removal.
Use "we" language ("our community guidelines..."). End with an invitation to try
again or join discussion elsewhere. Three to four sentences.`,
};

const RULES_BLOCK = (rules: SubredditRule[]): string => {
  if (rules.length === 0) {
    return 'No formal rules defined for this subreddit. Cite community norms generically.';
  }
  return rules
    .map((r, i) => `${i + 1}. ${r.shortName}: ${r.description}`)
    .join('\n');
};

const SYSTEM_PROMPT = `You are ModNote, an assistant that drafts removal-explanation
comments for Reddit moderators. Your output is a JSON object with three drafts:
firm, educational, and friendly.

Hard rules — violations make the draft unusable:
1. Cite ONLY rules from the provided list. Never invent a rule name.
2. Reference the specific rule that was violated.
3. Quote NO more than 12 words from the offending post (avoid copying violations into the reply).
4. Never insult the user or speculate about their motives.
5. Never use the words "AI", "ModNote", "automated", or "generated" in the draft.
6. Sign nothing — the moderator's account will post the comment.
7. Maximum 80 words per draft.

Return JSON only. No prose around it. Schema:
{
  "firm":        { "text": "...", "citedRule": "<shortName from rule list>" },
  "educational": { "text": "...", "citedRule": "<shortName from rule list>" },
  "friendly":    { "text": "...", "citedRule": "<shortName from rule list>" }
}`;

export function buildPrompt(ctx: RemovalContext): { system: string; user: string } {
  const user = `Subreddit: r/${ctx.subredditName}

Community rules:
${RULES_BLOCK(ctx.rules)}

Content being removed (${ctx.thingType}):
Author: u/${ctx.authorName}
${ctx.thingType === 'post' ? `Title: ${ctx.title}\n` : ''}Body: ${ctx.body.slice(0, 2000)}

Draft three removal-explanation replies. Use exactly these tones:

FIRM tone guide:
${TONE_GUIDE.firm}

EDUCATIONAL tone guide:
${TONE_GUIDE.educational}

FRIENDLY tone guide:
${TONE_GUIDE.friendly}

Return ONLY the JSON object described in the system prompt.`;

  return { system: SYSTEM_PROMPT, user };
}
