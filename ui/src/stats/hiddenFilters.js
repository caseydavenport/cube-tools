// Settings the stats requests send, adjusted for what the cube can show.
// Kept free of React so node tests can load it.

import { hasData } from "../utils/dataKinds.js"

// requestFilters returns the Synergy page's record setting to send to the
// server. A cube without results hides that control, so a setting left over
// from another cube is dropped instead of filtering with a control the viewer
// can't see.
export function requestFilters(filters, info) {
  if (hasData(info, "results")) {
    return { synergyRecord: filters.synergyRecord }
  }
  return { synergyRecord: "all" }
}
