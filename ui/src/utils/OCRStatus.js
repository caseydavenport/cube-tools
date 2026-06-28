// STATUS_COLOR maps a box's match status to the color the UI draws it in:
// gray pending, green/yellow for a high/low-confidence match, red unmatched.
// Shared by the photo overlay and the pool list so a box reads the same in both.
export const STATUS_COLOR = {
  pending: "#94a3b8",
  high: "#22c55e",
  low: "#eab308",
  very_low: "#eab308",
  unmatched: "#ef4444",
};
