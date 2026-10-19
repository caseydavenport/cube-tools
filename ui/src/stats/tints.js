// Background tints for table cells that show a gain or a loss. They're built
// from the theme's good and bad CSS variables, so they switch with light and
// dark mode on their own.

// goodBadTint returns a cell background for a change between -1 (the worst
// loss) and 1 (the best gain): the good color at or above zero, the bad color
// below, faint near zero and stronger toward either end.
export function goodBadTint(change) {
  const size = Math.min(1, Math.abs(change))
  const percent = Math.round((0.15 + size * 0.55) * 100)

  let color = "var(--se-good)"
  if (change < 0) {
    color = "var(--se-bad)"
  }
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}
