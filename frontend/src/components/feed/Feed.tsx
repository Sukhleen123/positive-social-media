import { useFeedStore } from "../../store/feedStore";
import { useContentFeed } from "../../hooks/useContentFeed";
import { useModerationScores } from "../../hooks/useModerationScores";
import { PostCard } from "./PostCard";
import styles from "./Feed.module.css";

export function Feed() {
  const { items, loading, error } = useFeedStore();

  useContentFeed();
  useModerationScores(items);

  if (loading) return <div className={styles.status}>Loading posts...</div>;
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (items.length === 0) return <div className={styles.status}>No posts found. Run seed_db.py to populate the database.</div>;

  return (
    <div className={styles.feed}>
      {items.map((item) => (
        <PostCard key={item.id} item={item} />
      ))}
    </div>
  );
}
