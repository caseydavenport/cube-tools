// Helpers several Synergy files share: card point colors, color filters,
// and a median.

import { White, Blue, Black, Red, Green } from "../../utils/Colors.js"
import { currentChartTheme, seriesColor, withAlpha } from "../../theme/chartTheme.js"

// Display color for a card based on its MTG color identity. Shared by the
// network graph and the popularity/synergy scatter. Colorless is muted and
// multicolor is the series palette's gold.
export function cardDisplayColor(colors) {
  if (!colors || colors.length === 0) return currentChartTheme().muted;
  if (colors.length > 1) return seriesColor(2);
  switch (colors[0]) {
    case "W": return White;
    case "U": return Blue;
    case "B": return Black;
    case "R": return Red;
    case "G": return Green;
    default: return currentChartTheme().muted;
  }
}

// pointOutline is the thin ring around scatter points, drawn in a faint text
// color so points stand apart on either background.
export function pointOutline() {
  return withAlpha(currentChartTheme().text, 0.4);
}

// colorsFromMatch pulls the color letters out of the global deck filter, so a
// color:R (or the Scryfall-style c:R) term narrows the synergy plots down to the
// picked colors, not just the decks feeding the math. ":" and "=" both work.
// Returns null when there's no color term so callers skip filtering.
export function colorsFromMatch(matchStr) {
  if (!matchStr) return null;
  const set = new Set();
  for (const term of matchStr.trim().split(/\s+/)) {
    const m = term.match(/^(?:color|c)[:=]([wubrg]+)$/i);
    if (m) {
      for (const ch of m[1].toUpperCase()) set.add(ch);
    }
  }
  return set.size > 0 ? set : null;
}

// cardInColors is the "contains any" test: a card shows when its identity holds at
// least one picked color. Gold cards show under each of their colors; colorless
// drops out whenever a color filter is on.
export function cardInColors(colors, colorSet) {
  if (!colorSet) return true;
  if (!colors || colors.length === 0) return false;
  return colors.some(c => colorSet.has(c));
}

// median of a numeric array, used for the hub-scatter crosshairs.
export function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
