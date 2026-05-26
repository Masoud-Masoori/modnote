import type { JSONObject, JSONValue } from '@devvit/public-api';

export type Tone = 'firm' | 'educational' | 'friendly';

export interface RemovalContext {
  thingId: string;
  thingType: 'post' | 'comment';
  title: string;
  body: string;
  authorName: string;
  subredditName: string;
  rules: SubredditRule[];
}

export interface SubredditRule {
  shortName: string;
  description: string;
  violationReason?: string;
}

/**
 * One draft reply for a single tone.
 *
 * The intersection with `JSONObject` makes it Devvit-Form-data-compatible so we can
 * pass it directly to `context.ui.showForm(formKey, data)` without lossy serialization.
 */
export interface DraftReply extends JSONObject {
  [key: string]: JSONValue;
  text: string;
  citedRule: string;
}

/**
 * Three drafts, one per tone — also a JSONObject so it can flow through Devvit's
 * Form bus directly.
 */
export interface DraftSet extends JSONObject {
  [key: string]: JSONValue;
  firm: DraftReply;
  educational: DraftReply;
  friendly: DraftReply;
}

export interface AppSettings {
  anthropicApiKey: string;
  defaultTone: Tone;
  dailyQuotaPerMod: number;
  appendSignature: boolean;
}
