// Small values and helpers several Archetypes files share: the inclusion
// cutoff, the three archetypes, and their series colors.

import { seriesColor } from "../../theme/chartTheme.js"

// The mark an archetype must hit to be included in this page.
// Set a default here that roughly maps to once every 4 drafts.
export const watermark = 100 * 1 / 32

export const macroArchetypes = new Set(["aggro", "midrange", "control"]);

// ARCHETYPE_SERIES picks each archetype's chart color from the series palette,
// so aggro, midrange, and control look the same on every chart on the page.
// They're not Magic colors, so they don't use the mana palette.
const ARCHETYPE_SERIES = { aggro: 3, midrange: 1, control: 4 }

// archetypeColor returns an archetype's chart color.
export function archetypeColor(archetype) {
  return seriesColor(ARCHETYPE_SERIES[archetype])
}
