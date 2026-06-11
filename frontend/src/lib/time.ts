export function formatElapsedSeconds(total: number): string {
  const safe = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
