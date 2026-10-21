// The colors that tell rules (groups and links) apart on the map and in the
// Rules editor.

// 20 categorical colors, keyed by label index - more colors, fewer collisions.
// Hues step by the golden angle so neighbors land far apart, lightness cycles
// three levels, and dark blues/purples are lifted to read on the slate bg.
export const RULE_COLORS = [
  // color-ok: palette that tells rules apart
  "#cb2a2a", "#56dc7d", "#c999ea", "#c3af28", "#56c6dc",
  // color-ok: palette that tells rules apart
  "#ea99c5", "#4ec328", "#5b56dc", "#eab499", "#28c389",
  // color-ok: palette that tells rules apart
  "#d156dc", "#d9ea99", "#2875c3", "#dc5671", "#99eaa0",
  // color-ok: palette that tells rules apart
  "#834ddb", "#dcb056", "#99eae7", "#c3289c", "#93dc56",
]

export function ruleColor(index) {
  return RULE_COLORS[index % RULE_COLORS.length]
}

// readableRuleColor is a rule's color for text. Some rule colors are pale, so
// it mixes the color toward the scheme's text color: darker in light mode,
// still light in dark mode, and the hue stays recognizable.
export function readableRuleColor(color) {
  return `color-mix(in srgb, ${color} 45%, var(--se-text))`
}
