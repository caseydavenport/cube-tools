// Win-rate confidence levels. The server computes every interval (see
// pkg/server/stats/confidence.go); the browser only picks the level to ask for.

// The confidence levels offered in the UI. Shared by every confidence selector.
export const WIN_CONFIDENCE_OPTS = [
  { label: "80%", value: "0.8" },
  { label: "90%", value: "0.9" },
  { label: "95%", value: "0.95" },
  { label: "99%", value: "0.99" },
]
