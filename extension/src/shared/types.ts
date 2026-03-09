export interface ExtensionSettings {
  enabled: boolean;
  threshold: number;
  anthropicApiKey: string;
  triggerText: string;
  pipelineVersion: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  threshold: 0.38,
  anthropicApiKey: '',
  triggerText: '',
  pipelineVersion: 'hyde-v1',
};

// Stored in chrome.storage.local (too large for .sync 8KB/key limit)
export interface TriggerData {
  rawText: string;
  hypotheticalExamples: string[];
  keywords: string[];
  exclusionTerms: string[];
  triggerEmbeddingFlat: number[];
  hypotheticalEmbeddingsFlat: number[];
  embeddingCount: number;
  pipelineVersion: string;
}

export type ElementStatus = 'pending' | 'safe' | 'sensitive' | 'user-safe' | 'user-sensitive';

// ---- Message types ----

export interface SaveTriggerMessage {
  type: 'SAVE_TRIGGER';
  triggerText: string;
  anthropicApiKey: string;
  threshold: number;
}

export interface ScoreBatchMessage {
  type: 'SCORE_BATCH';
  posts: Array<{
    elementId: string;
    text: string;
    subreddit?: string;
  }>;
}

export interface ScoreBatchResponse {
  results: Array<{
    elementId: string;
    score: number;
    isSensitive: boolean;
  }>;
  pending?: boolean;
}

export interface GetStatusMessage {
  type: 'GET_STATUS';
}

export interface GetStatusResponse {
  modelReady: boolean;
  modelLoading: boolean;
  loadProgress: number;
  triggerReady: boolean;
}

export interface SetOverrideMessage {
  type: 'SET_OVERRIDE';
  elementId: string;
  isSensitive: boolean;
}

export interface ExtensionDisabledMessage {
  type: 'EXTENSION_DISABLED';
}

export interface ExtensionEnabledMessage {
  type: 'EXTENSION_ENABLED';
}

export interface SettingsUpdatedMessage {
  type: 'SETTINGS_UPDATED';
}

export interface ModelProgressMessage {
  type: 'MODEL_PROGRESS';
  progress: number;
  status: string;
}

export type BackgroundMessage =
  | SaveTriggerMessage
  | ScoreBatchMessage
  | GetStatusMessage
  | SetOverrideMessage;

export type ContentMessage =
  | ExtensionDisabledMessage
  | ExtensionEnabledMessage
  | SettingsUpdatedMessage;

export type PopupMessage = ModelProgressMessage | SettingsUpdatedMessage;
