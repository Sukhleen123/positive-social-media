import styles from "./LoadingOverlay.module.css";

export function LoadingOverlay() {
  return (
    <div className={styles.overlay} aria-label="Checking content...">
      <div className={styles.spinner} />
      <span className={styles.label}>Checking...</span>
    </div>
  );
}
