import { ModeratedContent } from "../moderation/ModeratedContent";
import { useModerationStore } from "../../store/moderationStore";
import { useUserStore } from "../../store/userStore";
import { submitFeedback } from "../../api/moderation";
import type { ContentItem } from "../../types";
import styles from "./PostCard.module.css";

interface Props {
  item: ContentItem;
}

export function PostCard({ item }: Props) {
  const status = useModerationStore((s) => s.getStatus(item.id));
  const score = useModerationStore((s) => s.scores[item.id]?.cosine_score);
  const applyOverride = useModerationStore((s) => s.applyOverride);
  const userId = useUserStore((s) => s.userId);

  const date = item.created_utc
    ? new Date(item.created_utc * 1000).toLocaleDateString()
    : null;

  const handleFlag = async () => {
    if (!userId) return;
    applyOverride(item.id, true);
    await submitFeedback(userId, item.id, true);
  };

  const handleUnflag = async () => {
    if (!userId) return;
    applyOverride(item.id, false);
    await submitFeedback(userId, item.id, false);
  };

  return (
    <article className={styles.card}>
      <ModeratedContent
        status={status}
        onFlagSensitive={userId ? handleFlag : undefined}
        onUnflagSensitive={userId ? handleUnflag : undefined}
      >
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
                <span
                  className={styles.scoreDot}
                  style={{ background: `hsl(${Math.round((1 - Math.min(score / 0.55, 1)) * 120)}, 75%, 45%)` }}
                />
                {score.toFixed(2)}
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
