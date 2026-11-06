/**
 * Short, human relative times for the history list: "just now", "5 min ago",
 * "3 h ago", "2 d ago". Returns null once the moment is a week or more old, when
 * the date itself says it better.
 */
export function relativeTime(iso: string, now: Date = new Date()): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return 'just now'; // also covers a slightly fast clock
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return null;
}
