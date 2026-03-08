import { useState } from "react";
import { useUserStore } from "../../store/userStore";
import { useModerationStore } from "../../store/moderationStore";
import { upsertTrigger } from "../../api/users";
import styles from "./TriggerSettings.module.css";

export function TriggerSettings() {
  const { userId, triggerText, setTriggerText, setTriggerId, ensureUser } = useUserStore();
  const { reset } = useModerationStore();
  const [draft, setDraft] = useState(triggerText);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const uid = await ensureUser();
      const trigger = await upsertTrigger(uid, draft);
      setTriggerText(draft);
      setTriggerId(trigger.id);
      reset(); // invalidate all pending moderation states → re-score
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save trigger:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Content Filter</h2>
      <p className={styles.description}>
        Describe the topics you want filtered. Posts semantically similar to your description will be blurred.
      </p>
      <textarea
        className={styles.textarea}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. dog attacks, animal violence, graphic injury..."
        rows={3}
      />
      <div className={styles.footer}>
        {userId && (
          <span className={styles.userId}>User: {userId.slice(0, 8)}…</span>
        )}
        <button
          className={styles.btn}
          onClick={handleSave}
          disabled={saving || !draft.trim()}
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save Filter"}
        </button>
      </div>
    </div>
  );
}
