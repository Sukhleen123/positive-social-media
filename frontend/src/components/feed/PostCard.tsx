import { ModeratedContent } from "../moderation/ModeratedContent";
import { useModerationStore } from "../../store/moderationStore";
import type { ContentItem } from "../../types";
import styles from "./PostCard.module.css";

interface Props {
  item: ContentItem;
}

export function PostCard({ item }: Props) {
  const status = useModerationStore((s) => s.getStatus(item.id));
  const score = useModerationStore((s) => s.scores[item.id]?.cosine_score);

  const date = item.created_utc
    ? new Date(item.created_utc * 1000).toLocaleDateString()
    : null;

  return (
    <article className={styles.card}>
      <ModeratedContent status={status}>
        <div className={styles.content}>
          <div className={styles.meta}>
            <span className={styles.platform}>{item.platform}</span>
            {item.raw_metadata?.subreddit != null && (
              <span className={styles.subreddit}>
                r/{String(item.raw_metadata.subreddit)}
              </span>
            )}
            {item.author_handle && (
              <span className={styles.author}>u/{item.author_handle}</span>
            )}
            {date && <span className={styles.date}>{date}</span>}
            {score !== undefined && status !== "pending" && (
              <span
                className={styles.score}
                title={`Cosine similarity: ${score.toFixed(3)}`}
              >
                {status === "sensitive" ? "🔴" : "🟢"} {score.toFixed(2)}
              </span>
            )}
          </div>
          <h2 className={styles.title}>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title ?? "(no title)"}
              </a>
            ) : (
              item.title ?? "(no title)"
            )}
          </h2>
          {item.body && <p className={styles.body}>{item.body.slice(0, 300)}{item.body.length > 300 ? "…" : ""}</p>}
        </div>
      </ModeratedContent>
    </article>
  );
}
