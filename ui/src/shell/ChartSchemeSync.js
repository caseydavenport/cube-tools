import { useEffect } from "react"
import { useComputedColorScheme } from "@mantine/core"
import { Chart as ChartJS } from "chart.js"
import { applyChartTheme } from "../theme/chartTheme.js"

// ChartSchemeSync keeps Chart.js in step with the light/dark toggle. It draws
// nothing; whenever the color scheme changes it resets the chart defaults and
// redraws every chart on screen, so charts never need a reload to switch.
export function ChartSchemeSync() {
  const scheme = useComputedColorScheme("light")

  useEffect(() => {
    applyChartTheme(ChartJS, scheme)
  }, [scheme])

  return null
}
