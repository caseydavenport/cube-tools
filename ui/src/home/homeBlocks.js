// Which data each cube home block needs. A block whose cube lacks that data
// shows the reason ("needs decks") instead of empty numbers.
import { pageAvailability } from "../nav/sections.js"

// HOME_BLOCKS lists each block's needs, using the same data keys as the sidebar's
// page model (nav/sections.js). The drafts tile only needs the draft index.
export const HOME_BLOCKS = {
  draftsTile: { needs: [] },
  archetypeTile: { needs: ["decks", "results", "archetypes"] },
  colorPairTile: { needs: ["decks", "results"] },
  cardTile: { needs: ["decks", "results"] },
  recentDrafts: { needs: ["decks"] },
  colorWinRates: { needs: ["decks", "results"] },
  topPlayers: { needs: ["decks", "results"] },
}

// blockState reports whether the cube has what a block needs, and if not, why.
// It follows the sidebar's rule: unknown data counts as present.
export function blockState(block, info) {
  return pageAvailability(block, info)
}
