// Where a map's hover preview sits, so it stays clear of the hovered card.

// previewSide returns which top corner of the canvas the preview goes in: the
// side away from the hovered node, so the card and its neighbors stay visible.
export function previewSide(nodeX, canvasWidth) {
  if (nodeX > canvasWidth / 2) {
    return "left"
  }
  return "right"
}
