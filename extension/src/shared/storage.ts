import { DEFAULT_SETTINGS, ExtensionSettings, TriggerData } from './types';

const SETTINGS_KEY = 'psm_settings';
const TRIGGER_DATA_KEY = 'psm_trigger_data';
const OVERRIDES_KEY = 'psm_overrides';

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...current, ...partial } });
}

export async function getTriggerData(): Promise<TriggerData | null> {
  const result = await chrome.storage.local.get(TRIGGER_DATA_KEY);
  return (result[TRIGGER_DATA_KEY] as TriggerData) ?? null;
}

export async function saveTriggerData(data: TriggerData): Promise<void> {
  await chrome.storage.local.set({ [TRIGGER_DATA_KEY]: data });
}

export async function getOverrides(): Promise<Record<string, boolean>> {
  const result = await chrome.storage.local.get(OVERRIDES_KEY);
  return (result[OVERRIDES_KEY] as Record<string, boolean>) ?? {};
}

export async function setOverride(elementId: string, isSensitive: boolean): Promise<void> {
  const overrides = await getOverrides();
  overrides[elementId] = isSensitive;
  await chrome.storage.local.set({ [OVERRIDES_KEY]: overrides });
}
