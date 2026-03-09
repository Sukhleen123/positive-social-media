import { useState } from "react";
import { LoadingOverlay } from "./LoadingOverlay";
import type { ModerationStatus } from "../../types";
import styles from "./ModeratedContent.module.css";

interface Props {
  status: ModerationStatus;
  children: React.ReactNode;
  onFlagSensitive?: () => void;
  onUnflagSensitive?: () => void;
}

export function ModeratedContent({ status, children, onFlagSensitive, onUnflagSensitive }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (status === "pending") {
    return (
      <div className={styles.wrapper}>
        {children}
        <LoadingOverlay />
      </div>
    );
  }

  if (status === "sensitive" && !revealed) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.blurred} aria-hidden="true">
          {children}
        </div>
        <div className={styles.sensitiveOverlay}>
          <span className={styles.sensitiveLabel}>Sensitive content</span>
          <button className={styles.revealBtn} onClick={() => setRevealed(true)}>
            Reveal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {children}
      <div className={styles.feedbackBar}>
        {status === "sensitive" && revealed && (
          <>
            <button className={styles.hideBtn} onClick={() => setRevealed(false)}>
              Hide again
            </button>
            {onUnflagSensitive && (
              <button className={styles.feedbackBtn} onClick={onUnflagSensitive}>
                Not sensitive
              </button>
            )}
          </>
        )}
        {status === "safe" && onFlagSensitive && (
          <button className={styles.feedbackBtn} onClick={onFlagSensitive}>
            Flag as sensitive
          </button>
        )}
      </div>
    </div>
  );
}
