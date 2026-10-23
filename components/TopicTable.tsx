import { n, pct } from "@/lib/format";
import { topicLabel } from "@/lib/topics";
type Topic = { key: string; posts: number; ha: number; haPerPost: number };
// One row per topic: the bar shows total likes; posts and likes/post sit beside it.
export function TopicTable({ topics, total }: { topics: Topic[]; total: number }) {
  const max = Math.max(...topics.map((t) => t.ha), 0);
  return (
    <div className="table-wrap" style={{ boxShadow: "none" }}>
      <table>
        <thead><tr><th>Topic</th><th style={{ width: "40%" }}>Total likes</th><th className="r">Posts</th><th className="r">Share</th><th className="r">Likes / post</th></tr></thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.key}>
              <td><b>{topicLabel(t.key)}</b></td>
              <td>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="bar-fill" style={{ display: "block", height: 14, width: `${max ? (t.ha / max) * 80 : 0}%` }} />
                  <span className="bar-value">{n(t.ha)}</span>
                </span>
              </td>
              <td className="r num">{n(t.posts)}</td>
              <td className="r num">{pct(t.posts, total)}</td>
              <td className="r num">{t.haPerPost.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
