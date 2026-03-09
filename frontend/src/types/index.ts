// TypeScript interfaces mirroring Pydantic schemas exactly

export interface ContentItem {
  id: string;
  platform: string;
  platform_id: string;
  title: string | null;
  body: string | null;
  author_handle: string | null;
  url: string | null;
  created_utc: number | null;
  raw_metadata: Record<string, unknown> | null;
  fetched_at: number;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
}

export interface TriggerProfile {
  id: string;
  user_id: string;
  raw_text: string;
  updated_at: number;
}

export interface ScoreResult {
  content_id: string;
  cosine_score: number;
  is_sensitive: boolean;
  is_user_override?: boolean;
}

export type ModerationStatus = "pending" | "safe" | "sensitive";

export interface ModerationState {
  status: ModerationStatus;
  cosine_score?: number;
  is_user_override?: boolean;
}

export interface FeedbackRequest {
  user_id: string;
  content_id: string;
  is_sensitive: boolean;
}
