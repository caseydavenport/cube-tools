// Design tokens shared by the Mantine theme and the legacy CSS bridge. Kept free of
// imports so node tests can load it directly.

// PRIMARY_SHADES is the "sylvan" violet scale Mantine needs, lightest first.
export const PRIMARY_SHADES = [
  "#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa",
  "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95",
]

export const LIGHT = {
  page: "#fbf8f4",
  card: "#ffffff",
  text: "#2a2238",
  muted: "#7a6f86",
  border: "#ece4ee",
  sidebarFrom: "#f3e8ff",
  sidebarTo: "#ffe4e1",
  good: "#16a34a",
  bad: "#e11d48",
}

export const DARK = {
  page: "#1a1625",
  card: "#231d31",
  text: "#f4effa",
  muted: "#a69cb5",
  border: "#342b45",
  sidebarFrom: "#2a1f3d",
  sidebarTo: "#3a1f2c",
  good: "#4ade80",
  bad: "#fb7185",
}

// MANA colors match the land icons in public/img, so they don't change by scheme.
export const MANA = {
  W: "#f3e29d",
  U: "#80c1e7",
  B: "#9c91c9",
  R: "#f08676",
  G: "#93c775",
}
