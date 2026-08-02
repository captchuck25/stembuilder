// Pure helper shared by the leaderboard API route (server) and client UI.
// Student-facing leaderboards never show full names: "Maya Rodriguez" → "Maya R."
// Falls back to username (username-only accounts have no real name), then a
// generic label.

export function formatLeaderboardName(
  name: string | null | undefined,
  username: string | null | undefined,
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
    }
    return parts[0];
  }
  const uname = (username ?? "").trim();
  return uname || "Student";
}
