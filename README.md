# ModNote

**Every removal, explained — in one click.**

ModNote is a Reddit Developer Platform (Devvit) app that turns every post-removal
into a one-click, AI-drafted, rule-citing explanation. The goal is to make
unexplained-removal modmail almost disappear from a moderator's queue.

> Built for the [Reddit Mod Tools and Migrated Apps Hackathon](https://mod-tools-migration.devpost.com/) — track: **Best New Mod Tool**.

## What it does

1. Moderator clicks **"Remove with ModNote"** on a post or comment (mod-only menu).
2. ModNote reads the content + that subreddit's rules.
3. Anthropic Claude Haiku 4.5 drafts **three** replies — firm / educational / friendly — each citing the specific rule violated.
4. Mod sees a modal with all three drafts, picks one, edits if needed, presses **Remove and reply**.
5. ModNote posts the chosen draft as a distinguished mod comment AND removes the original item.

The user who got removed sees a real explanation in their inbox. Modmail backlog drops.

## Why it's different from existing mod tools

| Tool | What it does | What ModNote does differently |
|---|---|---|
| **AutoModerator** | Rule-engine, regex-based, automatic | Human-in-the-loop, context-aware, tone-aware |
| **Reddit's "Recommended Removal Reasons"** (March 2026) | Template matcher from pre-saved reasons | Drafts a **new** message for **this** post, citing the specific rule and the specific issue |
| **Toolbox** browser extension | Slot-filling macros (`{user}`, `{rule}`) | ModNote writes the reasoning sentence, not just slot-fills |
| **Removed.io** | Helps users check why a post was removed | ModNote prevents the question by attaching the explanation upfront |

## Quickstart for moderators

```bash
# 1. Install the app on your subreddit from developers.reddit.com
# 2. Settings → ModNote → Anthropic API key (get one at console.anthropic.com)
# 3. Choose default tone, daily quota
# 4. Done. Right-click any post → "Remove with ModNote"
```

## Architecture

```
[Moderator clicks "Remove with ModNote"]
              ↓
[Devvit menu action handler — src/main.tsx]
              ↓
[Read: post.title, post.body, subreddit.rules, settings.tone]
              ↓
[HTTPS POST → api.anthropic.com (Claude Haiku 4.5) via context.fetch]
              ↓
[Returns 3 drafts: firm / educational / friendly — JSON]
              ↓
[Devvit.createForm — modal shows drafts; mod picks + edits]
              ↓
[context.reddit.submitComment().distinguish(true) + post.remove(false)]
              ↓
[Redis: increment subreddit usage counters + per-mod daily quota]
              ↓
[Toast: "Removed with ModNote — explanation posted"]
```

### Permissions used

- `redditAPI` — read post/comment/rules, submit comment, remove
- `redis` — per-mod daily quota counter, usage metrics
- `http` — outbound to `api.anthropic.com` (whitelisted in devvit.yaml)

### Built-in safeguards

- **Mod confirms every draft.** No automated speech.
- **Quota.** Per-moderator daily cap (default 50, configurable).
- **Rule validation.** Drafts are post-processed to ensure the cited rule actually
  exists in the subreddit's rule list; if not, the cited rule is reset.
- **PII / loaded vocabulary scrub.** Drafts strip banned phrases ("AI",
  "automated", "generated") before display.
- **Secrets.** API key stored via Devvit's `isSecret: true` setting (encrypted,
  invisible after save).

## Local development

```bash
# Requires Node 20+, Devvit CLI installed
npm install
devvit login
devvit playtest <your-test-subreddit>
```

Then open your test subreddit, right-click any post → "Remove with ModNote".

## Files

```
src/
├── main.tsx       Menu items, form, settings, action handler
├── llm.ts         Anthropic API call + JSON parsing + draft validation
├── prompts.ts     System + user prompt builder for the 3 tones
└── types.ts       Shared types
devvit.yaml        Permissions + HTTP domain whitelist
```

## Roadmap (post-hackathon)

- **v0.2** — Removal-reason analytics dashboard (which rules trip most, which
  tones get fewest modmail follow-ups).
- **v0.3** — Modmail companion: same drafting engine, but for modmail replies.
- **v0.4** — Optional pre-removal "explain before you remove" mode for newer
  mods (training wheels).
- **v0.5** — Multi-language drafts.

## License

BSD-3-Clause. Use it, fork it, ship it.

## Built by

[Masoud Masoori](https://github.com/Masoud-Masoori) — MAS-AI Technologies Inc.
Engineering partner: Claude Opus 4.7.
