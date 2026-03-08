import { useState } from "react";
import { LoadingOverlay } from "./LoadingOverlay";
import type { ModerationStatus } from "../../types";
import styles from "./ModeratedContent.module.css";

interface Props {
  status: ModerationStatus;
  children: React.ReactNode;
}

export function ModeratedContent({ status, children }: Props) {
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

  return <div className={styles.wrapper}>{children}</div>;
}
