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

export interface DraftSet {
  firm: DraftReply;
  educational: DraftReply;
  friendly: DraftReply;
}

export interface DraftReply {
  text: string;
  citedRule: string;
}

export interface AppSettings {
  anthropicApiKey: string;
  defaultTone: Tone;
  dailyQuotaPerMod: number;
  appendSignature: boolean;
}
