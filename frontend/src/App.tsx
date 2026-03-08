import { TriggerSettings } from "./components/settings/TriggerSettings";
import { Feed } from "./components/feed/Feed";
import styles from "./App.module.css";

export default function App() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Positive Social Media</h1>
        <p className={styles.tagline}>Reddit-style feed with personal content filtering</p>
      </header>
      <main className={styles.main}>
        <TriggerSettings />
        <Feed />
      </main>
    </div>
  );
}
