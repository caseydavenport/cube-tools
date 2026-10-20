// Settings the stats requests send, adjusted for what the cube can show.
// Kept free of React so node tests can load it.

import { hasData } from "../utils/dataKinds.js"

// requestFilters returns the significant-only and record settings to send to
// the server. A cube without results hides both controls, so a setting left
// over from another cube is dropped instead of filtering with a control the
// viewer can't see.
export function requestFilters(filters, info) {
  if (hasData(info, "results")) {
    return { significantOnly: filters.significantOnly, synergyRecord: filters.synergyRecord }
  }
  return { significantOnly: false, synergyRecord: "all" }
}
