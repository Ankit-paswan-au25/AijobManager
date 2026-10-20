/** 45 -> "45m", 200 -> "3h 20m", 3000 -> "2d 2h". */
export function formatDuration(totalMinutes) {
  const m = Math.max(0, Math.floor(totalMinutes));
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  if (hours < 48) return `${hours}h ${m % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
