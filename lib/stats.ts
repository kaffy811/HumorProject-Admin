import { dateKey, median, slot, tokenCount } from "./format";

export type ProfileRow = { id: string; username: string | null; first_name: string | null; last_name: string | null; display_name: string | null; avatar_path: string | null; created_at: string; onboarded_at: string | null; is_official: boolean; is_superadmin: boolean; is_admin?: boolean };
export type ImageRow = { id: string; user_id: string; status: string; created_at: string; storage_path: string | null };
export type CaptionRow = { id: string; image_id: string; content: string; style: string; source: string; created_at: string; deleted_at: string | null };
export type VoteRow = { user_id: string; caption_id: string; value: number; created_at: string };
export type CommentRow = { id: string; caption_id: string; user_id: string; created_at: string; deleted_at: string | null };
export type CommentVoteRow = { comment_id: string; user_id: string; created_at: string };
export type GenerationRow = { image_id: string; status: string; model: string; failure_stage: string | null; usage_metadata: unknown; created_at: string; completed_at: string | null };
export type SaveRow = { caption_id: string };
export type ReportRow = { caption_id: string; reason: string };

export type StatsInput = {
  profiles: ProfileRow[]; images: ImageRow[]; captions: CaptionRow[]; votes: VoteRow[];
  comments: CommentRow[]; commentVotes: CommentVoteRow[]; generations: GenerationRow[];
  saves: SaveRow[]; reports: ReportRow[]; now?: Date;
};

const LENGTH_BUCKETS = [
  { label: "Under 40 chars", max: 40 },
  { label: "40–79", max: 80 },
  { label: "80–119", max: 120 },
  { label: "120+", max: Infinity },
];

function countBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(key(row), (map.get(key(row)) || 0) + 1);
  return map;
}
function top<T>(map: Map<string, number>, limit: number, build: (id: string, count: number) => T) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id, count]) => build(id, count));
}

// Pure: every number on the dashboard comes from here, so it is unit tested.
export function computeStats(input: StatsInput) {
  const now = input.now ?? new Date();
  const imageById = new Map(input.images.map((image) => [image.id, image]));
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const live = input.captions.filter((caption) => !caption.deleted_at && imageById.get(caption.image_id)?.status === "ready");
  const liveIds = new Set(live.map((caption) => caption.id));
  const ha = input.votes.filter((vote) => vote.value === 1 && liveIds.has(vote.caption_id));
  const boos = input.votes.filter((vote) => vote.value === -1 && liveIds.has(vote.caption_id));
  const haByPost = countBy(ha, (vote) => vote.caption_id);
  const liveComments = input.comments.filter((comment) => !comment.deleted_at);
  const captionById = new Map(input.captions.map((caption) => [caption.id, caption]));
  const authorOf = (captionId: string) => imageById.get(captionById.get(captionId)?.image_id || "")?.user_id;

  // 30-day trend, oldest first, in campus time.
  const days: { date: string; posts: number; ha: number; comments: number }[] = [];
  for (let offset = 29; offset >= 0; offset--)
    days.push({ date: dateKey(new Date(now.getTime() - offset * 86_400_000)), posts: 0, ha: 0, comments: 0 });
  const dayIndex = new Map(days.map((entry, index) => [entry.date, index]));
  const bump = (value: string, field: "posts" | "ha" | "comments") => {
    const index = dayIndex.get(dateKey(value));
    if (index !== undefined) days[index][field]++;
  };
  live.forEach((caption) => bump(caption.created_at, "posts"));
  ha.forEach((vote) => bump(vote.created_at, "ha"));
  liveComments.forEach((comment) => bump(comment.created_at, "comments"));

  // When campus laughs: Ha votes + comment hearts by weekday × hour.
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const event of [...ha.map((v) => v.created_at), ...input.commentVotes.map((v) => v.created_at)]) {
    const { weekday, hour } = slot(event);
    if (weekday >= 0) heatmap[weekday][hour]++;
  }
  const laughs = heatmap.flat().reduce((a, b) => a + b, 0);
  const lateNight = heatmap.reduce((sum, row) => sum + row.slice(0, 5).reduce((a, b) => a + b, 0), 0);
  let peak = { weekday: 0, hour: 0, count: 0 };
  heatmap.forEach((row, weekday) => row.forEach((count, hour) => { if (count > peak.count) peak = { weekday, hour, count }; }));

  const styles = [...countBy(live, (caption) => caption.style).entries()].map(([style, posts]) => {
    const total = live.filter((caption) => caption.style === style).reduce((sum, caption) => sum + (haByPost.get(caption.id) || 0), 0);
    return { style, posts, ha: total, average: posts ? total / posts : 0 };
  }).sort((a, b) => b.average - a.average || b.posts - a.posts);

  const lengths = LENGTH_BUCKETS.map((bucket, index) => {
    const min = index ? LENGTH_BUCKETS[index - 1].max : 0;
    const posts = live.filter((caption) => caption.content.length >= min && caption.content.length < bucket.max);
    const total = posts.reduce((sum, caption) => sum + (haByPost.get(caption.id) || 0), 0);
    return { label: bucket.label, posts: posts.length, average: posts.length ? total / posts.length : 0 };
  });

  const earliest = new Map<string, number>();
  for (const vote of ha) {
    const time = new Date(vote.created_at).getTime();
    earliest.set(vote.caption_id, Math.min(time, earliest.get(vote.caption_id) ?? Infinity));
  }
  const firstLaugh = live.filter((caption) => earliest.has(caption.id))
    .map((caption) => Math.max(0, earliest.get(caption.id)! - new Date(caption.created_at).getTime()));

  const generatedImages = new Set(input.generations.filter((g) => g.status === "completed").map((g) => g.image_id));
  const publishedImages = new Set(input.captions.map((caption) => caption.image_id));
  // Each step is a subset of the one before, so the percentages stay honest.
  const funnel = [
    { label: "Photos uploaded", count: input.images.length },
    { label: "Published", count: input.images.filter((image) => publishedImages.has(image.id)).length },
    { label: "Still live", count: new Set(live.map((caption) => caption.image_id)).size },
    { label: "Got a laugh", count: new Set(live.filter((caption) => haByPost.has(caption.id)).map((caption) => caption.image_id)).size },
  ];
  const aiCaptioned = input.images.filter((image) => publishedImages.has(image.id) && generatedImages.has(image.id)).length;

  const tokens = input.generations.reduce((sum, generation) => sum + tokenCount(generation.usage_metadata), 0);
  const completed = input.generations.filter((g) => g.status === "completed");
  const latencies = completed.filter((g) => g.completed_at).map((g) => new Date(g.completed_at!).getTime() - new Date(g.created_at).getTime());

  const silent = live.filter((caption) => !haByPost.has(caption.id) && now.getTime() - new Date(caption.created_at).getTime() > 3 * 86_400_000).length;
  const selfLaughs = ha.filter((vote) => authorOf(vote.caption_id) === vote.user_id).length;
  const generous = top(countBy(ha, (vote) => vote.user_id), 5, (id, count) => ({ profile: profileById.get(id) ?? null, id, count }));
  const crowd = top(countBy(ha, (vote) => authorOf(vote.caption_id) || "unknown"), 5, (id, count) => ({ profile: profileById.get(id) ?? null, id, count }));
  const hall = top(haByPost, 5, (id, count) => {
    const caption = captionById.get(id)!;
    return { id, count, content: caption.content, style: caption.style, imagePath: imageById.get(caption.image_id)?.storage_path ?? null, author: profileById.get(imageById.get(caption.image_id)?.user_id || "") ?? null };
  });
  const commentHearts = countBy(input.commentVotes, (vote) => vote.comment_id);

  return {
    totals: {
      members: input.profiles.filter((p) => !p.is_official).length,
      onboarded: input.profiles.filter((p) => !p.is_official && p.onboarded_at).length,
      superadmins: input.profiles.filter((p) => p.is_superadmin).length,
      admins: input.profiles.filter((p) => !p.is_superadmin && p.is_admin === true).length,
      livePosts: live.length,
      deletedPosts: input.captions.filter((c) => c.deleted_at).length,
      ha: ha.length,
      boos: boos.length,
      comments: liveComments.length,
      commentHearts: input.commentVotes.length,
      heartedComments: commentHearts.size,
      saves: input.saves.length,
      reports: input.reports.length,
      laughRate: live.length ? live.filter((c) => haByPost.has(c.id)).length / live.length : 0,
      haPerPost: live.length ? ha.length / live.length : 0,
    },
    aiCaptioned, days, heatmap, laughs, lateNight, peak, styles, lengths, funnel, hall, generous, crowd, silent, selfLaughs,
    medianFirstLaugh: median(firstLaugh),
    sources: [...countBy(live, (c) => c.source).entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    reports: [...countBy(input.reports, (r) => r.reason).entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    gemini: {
      total: input.generations.length,
      completed: completed.length,
      failed: input.generations.filter((g) => g.status === "failed").length,
      processing: input.generations.filter((g) => g.status === "processing").length,
      tokens,
      tokensPerCaptionSet: completed.length ? tokens / completed.length : 0,
      medianLatency: median(latencies),
      models: [...countBy(input.generations, (g) => g.model).entries()].map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
      failures: [...countBy(input.generations.filter((g) => g.status === "failed"), (g) => g.failure_stage || "unknown").entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
    },
  };
}
export type Stats = ReturnType<typeof computeStats>;
