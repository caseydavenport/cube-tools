// A small link from a curated view to the Charts page, opened on the slice
// that matches what the view shows, so it can be split or filtered further.

import React from "react"
import { Link } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { pageHref } from "../shell/paths.js"
import { sliceQuery } from "./chartsSlice.js"

// COLOR_TYPE_SIZES maps a Colors page color type to the Charts page's color
// group size. Charts has no mixed-size view, so Any opens on pairs.
const COLOR_TYPE_SIZES = { Mono: 1, Dual: 2, Trio: 3, Any: 2 }

// colorSide is a Charts slice side grouping by color, sized for the Colors
// page's color type and counted with its color mode.
export function colorSide(dim, colorType, colorMode) {
  return { dim, granularity: COLOR_TYPE_SIZES[colorType] || 1, color_mode: colorMode || "inclusive" }
}

// OpenInCharts links to the Charts page opened on slice, a partial slice the
// Charts defaults fill out.
export function OpenInCharts({ slice }) {
  const cube = useCube()
  const to = `${pageHref(cube, "charts")}?${sliceQuery(slice)}`
  return <Link className="open-in-charts" to={to}>Open in Charts →</Link>
}
