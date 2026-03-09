import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, ExtensionSettings, GetStatusResponse } from '../shared/types';
import { getSettings, saveSettings } from '../shared/storage';
import { PREDEFINED_TOPICS } from '../shared/topics';

interface ModelStatus {
  modelReady: boolean;
  modelLoading: boolean;
  loadProgress: number;
  triggerReady: boolean;
}

export default function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({
    modelReady: false,
    modelLoading: false,
    loadProgress: 0,
    triggerReady: false,
  });
  const [triggerDraft, setTriggerDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load settings on mount
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setTriggerDraft(s.triggerText);
      setApiKeyDraft(s.anthropicApiKey);
      setSelectedTopics(s.selectedTopics ?? []);
    });
  }, []);

  // Poll model status
  const pollStatus = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response: GetStatusResponse) => {
      if (chrome.runtime.lastError) return;
      setModelStatus(response);
      if (response.modelReady && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    pollStatus();
    pollTimerRef.current = setInterval(pollStatus, 500);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [pollStatus]);

  // Listen for MODEL_PROGRESS messages
  useEffect(() => {
    const listener = (message: { type: string; progress?: number }) => {
      if (message.type === 'MODEL_PROGRESS') {
        pollStatus();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [pollStatus]);

  async function handleToggleEnabled() {
    const next = !settings.enabled;
    const updated = { ...settings, enabled: next };
    setSettings(updated);
    await saveSettings({ enabled: next });

    const tabs = await chrome.tabs.query({ url: '*://www.reddit.com/*' });
    const msgType = next ? 'EXTENSION_ENABLED' : 'EXTENSION_DISABLED';
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: msgType }).catch(() => {});
      }
    }
  }

  async function handleTopicToggle(id: string) {
    const next = selectedTopics.includes(id)
      ? selectedTopics.filter((t) => t !== id)
      : [...selectedTopics, id];
    setSelectedTopics(next);
    await saveSettings({ selectedTopics: next });
  }

  async function handleSaveTrigger() {
    if (!triggerDraft.trim()) return;
    setSaving(true);
    setSaveResult(null);

    try {
      await saveSettings({
        triggerText: triggerDraft,
        anthropicApiKey: apiKeyDraft,
      });
      setSettings((s) => ({ ...s, triggerText: triggerDraft, anthropicApiKey: apiKeyDraft }));

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_TRIGGER',
        triggerText: triggerDraft,
        anthropicApiKey: apiKeyDraft,
        threshold: settings.threshold,
        selectedTopics,
      });

      if (response?.success) {
        setSaveResult('Trigger saved!');
        setModelStatus((s) => ({ ...s, triggerReady: true }));
      } else {
        setSaveResult(response?.error ?? 'Failed to save trigger');
      }
    } catch (err) {
      setSaveResult(String(err));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 3000);
    }
  }

  async function handleThresholdChange(value: number) {
    const updated = { ...settings, threshold: value };
    setSettings(updated);
    await saveSettings({ threshold: value });
  }

  function renderModelStatus() {
    if (modelStatus.modelLoading && !modelStatus.modelReady) {
      return (
        <div className="model-status model-status--loading">
          <div className="model-progress-bar">
            <div
              className="model-progress-fill"
              style={{ width: `${modelStatus.loadProgress}%` }}
            />
          </div>
          <span className="model-status-text">
            Downloading model… {modelStatus.loadProgress}%
          </span>
        </div>
      );
    }
    if (modelStatus.modelReady) {
      return (
        <div className="model-status model-status--ready">
          <span className="model-dot" />
          <span className="model-status-text">Model ready</span>
          {!modelStatus.triggerReady && (
            <span className="model-hint">Set a trigger to get started</span>
          )}
        </div>
      );
    }
    return (
      <div className="model-status model-status--idle">
        <span className="model-status-text">Initializing model…</span>
      </div>
    );
  }

  return (
    <div className="popup">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <span className="header-icon">🛡️</span>
          <span className="header-title">Positive Social Media</span>
        </div>
        <button
          className={`toggle-pill ${settings.enabled ? 'toggle-pill--on' : 'toggle-pill--off'}`}
          onClick={handleToggleEnabled}
          aria-label={settings.enabled ? 'Disable' : 'Enable'}
        >
          <span className="toggle-knob" />
        </button>
      </div>

      {/* Model status */}
      {renderModelStatus()}

      <div className="divider" />

      {/* Trigger input */}
      <div className="section">
        <label className="label" htmlFor="trigger">
          Content to filter
        </label>
        <textarea
          id="trigger"
          className="textarea"
          placeholder="e.g. graphic violence, political drama, self-harm"
          maxLength={500}
          rows={3}
          value={triggerDraft}
          onChange={(e) => setTriggerDraft(e.target.value)}
        />
        <div className="row-end">
          <span className="char-count">{triggerDraft.length}/500</span>
          <button
            className="btn-primary"
            onClick={handleSaveTrigger}
            disabled={saving || !triggerDraft.trim() || !modelStatus.modelReady}
          >
            {saving ? (
              <span className="spinner" />
            ) : (
              'Save trigger'
            )}
          </button>
        </div>
        {saveResult && (
          <div className={`save-result ${saveResult.includes('!') ? 'save-result--ok' : 'save-result--err'}`}>
            {saveResult}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Quick topic filters */}
      <div className="section">
        <label className="label">Quick topic filters</label>
        <div className="topic-grid">
          {PREDEFINED_TOPICS.map((topic) => {
            const selected = selectedTopics.includes(topic.id);
            return (
              <button
                key={topic.id}
                className={`topic-chip ${selected ? 'topic-chip--on' : ''}`}
                onClick={() => handleTopicToggle(topic.id)}
              >
                {topic.label}
              </button>
            );
          })}
        </div>
        <p className="hint">Combined with your filter description above</p>
      </div>

      <div className="divider" />

      {/* Threshold slider */}
      <div className="section">
        <div className="threshold-header">
          <label className="label" htmlFor="threshold">
            Sensitivity threshold
          </label>
          <span className="threshold-value">{settings.threshold.toFixed(2)}</span>
        </div>
        <input
          id="threshold"
          type="range"
          className="slider"
          min={0.20}
          max={0.80}
          step={0.01}
          value={settings.threshold}
          onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
        />
        <div className="slider-labels">
          <span>Strict · more matches</span>
          <span>Lenient · fewer</span>
        </div>
      </div>

      <div className="divider" />

      {/* API key */}
      <div className="section">
        <label className="label" htmlFor="apikey">
          Anthropic API key{' '}
          <span className="label-optional">(optional — enables smarter matching)</span>
        </label>
        <input
          id="apikey"
          type="password"
          className="input"
          placeholder="sk-ant-…"
          value={apiKeyDraft}
          onChange={(e) => setApiKeyDraft(e.target.value)}
          autoComplete="off"
        />
        <p className="hint">Stored locally. Used only when saving a trigger.</p>
      </div>
    </div>
  );
}
