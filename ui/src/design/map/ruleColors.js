// The colors that tell rules (groups and links) apart on the map and in the
// Rules editor.

// 20 categorical colors, keyed by label index - more colors, fewer collisions.
// Hues step by the golden angle so neighbors land far apart, lightness cycles
// three levels, and dark blues/purples are lifted to read on the slate bg.
export const RULE_COLORS = [
  "#cb2a2a", "#56dc7d", "#c999ea", "#c3af28", "#56c6dc",
  "#ea99c5", "#4ec328", "#5b56dc", "#eab499", "#28c389",
  "#d156dc", "#d9ea99", "#2875c3", "#dc5671", "#99eaa0",
  "#834ddb", "#dcb056", "#99eae7", "#c3289c", "#93dc56",
]

export function ruleColor(index) {
  return RULE_COLORS[index % RULE_COLORS.length]
}
