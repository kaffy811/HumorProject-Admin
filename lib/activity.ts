export const CATEGORIES: Record<string, string> = {
  auth: "Sign-in", post: "Posts", ai: "AI generation", reaction: "Likes & hearts", comment: "Comments",
  save: "Saves", report: "Reports", profile: "Profile", admin: "Admin",
};
export const ACTIONS: Record<string, string> = {
  login: "Signed in", logout: "Signed out", signup: "Created an account", admin_login: "Opened the admin console",
  upload: "Uploaded a photo", publish: "Published a post", edit: "Edited a post", delete: "Deleted a post", restore: "Restored a post", purge: "Permanently removed a post",
  generate: "Generated captions", generate_failed: "Caption generation failed",
  ha: "Gave a Ha", unha: "Took back a Ha", downvote: "Downvoted a post", heart: "Hearted a comment", unheart: "Removed a comment heart",
  comment: "Commented", reply: "Replied to a comment", delete_comment: "Deleted a comment",
  save: "Saved a post", unsave: "Unsaved a post", report_post: "Reported a post", report_comment: "Reported a comment",
  onboard: "Finished onboarding", update_profile: "Updated their profile",
  request_superadmin: "Requested superadmin access", approve_request: "Approved a superadmin request", reject_request: "Declined a superadmin request",
  grant_superadmin: "Became a superadmin", revoke_superadmin: "Lost superadmin access",
};
export const describe = (action: string) => ACTIONS[action] ?? action.replace(/_/g, " ");
// Short human detail for a log row's JSON payload.
export function detailText(action: string, detail: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof detail.caption === "string") parts.push(`“${detail.caption}”`);
  if (typeof detail.text === "string") parts.push(`“${detail.text}”`);
  if (typeof detail.before === "string" && action === "edit") parts.push(`was “${detail.before}”`);
  if (typeof detail.model === "string") parts.push(String(detail.model));
  if (typeof detail.stage === "string" && detail.stage) parts.push(`failed at ${detail.stage}`);
  if (typeof detail.reason === "string") parts.push(String(detail.reason));
  if (typeof detail.username === "string") parts.push(`@${detail.username}`);
  if (detail.avatar === true) parts.push("new photo");
  if (typeof detail.userAgent === "string") parts.push(browser(detail.userAgent));
  return parts.join(" · ");
}
function browser(agent: string) {
  const name = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : /Mac OS X/.test(agent) ? "macOS" : /Windows/.test(agent) ? "Windows" : "";
  return [name, os].filter(Boolean).join(" on ");
}
