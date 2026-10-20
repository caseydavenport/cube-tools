// The Colors stats page: the color stats table, the charts over time, and the
// matchup heatmap. The pieces live in the other files here.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { availableValue, hasData, visibleItems } from "../../utils/dataKinds.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { ColorStatsTable, TableHeader } from "./ColorStatsTable.js"
import { ColorPerformanceDeltaChart, ColorRateChart } from "./ColorRateCharts.js"
import { ColorMatchupHeatmap } from "./ColorMatchupHeatmap.js"
import { COLORS_COPY } from "./copy.js"

// Register chart JS objects that we need to use.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// CHART_OPTIONS are the measures the two charts over time can show. needs
// lists the data a measure is built from, so a cube without it doesn't offer it.
const CHART_OPTIONS = [
  { label: COLORS_COPY.widget.chartBuilds, value: "builds" },
  { label: COLORS_COPY.widget.chartWins, value: "wins", needs: ["results"] },
  { label: COLORS_COPY.widget.chartPicks, value: "pick_percentage" },
  { label: COLORS_COPY.widget.chartSplash, value: "splash" },
  { label: COLORS_COPY.widget.chartVpPct, value: "vps_pct", needs: ["results"] },
  { label: COLORS_COPY.widget.chartVps, value: "vps", needs: ["results"] },
  { label: COLORS_COPY.widget.chartPercentOfWins, value: "percent_of_wins", needs: ["results"] },
  { label: COLORS_COPY.widget.chartWinningPct, value: "winning_pct", needs: ["results"] },
  { label: COLORS_COPY.widget.chartTrophyPct, value: "trophy_pct", needs: ["results"] },
  { label: COLORS_COPY.widget.chartLastPlacePct, value: "lastplace_pct", needs: ["results"] },
]

// chartLabel returns the label of a chart option, for its card's title.
function chartLabel(value) {
  for (const option of CHART_OPTIONS) {
    if (option.value === value) {
      return option.label
    }
  }
  return ""
}

// ColorWidget is the Colors page: the stats table by color, two charts over
// time side by side, and, for cubes with match results, the win rate against
// the cube average and the matchup heatmap.
export function ColorWidget(input) {
  const [leftChart, setLeftChart] = React.useState("builds")
  const [rightChart, setRightChart] = React.useState("wins")

  if (!input.show) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const options = visibleItems(CHART_OPTIONS, input.info)
  const left = availableValue(leftChart, CHART_OPTIONS, input.info)
  const right = availableValue(rightChart, CHART_OPTIONS, input.info, left)

  return (
    <div className="analyze-page colors-grid">
      <div className="colors-wide">
        <SectionCard title={input.copy.colorStats} action={<TableHeader {...input} />}>
          <ColorStatsTable
            parsed={input.parsed}
            colorData={input.parsed.colorData}
            colorTypeSelection={input.colorTypeSelection}
            decks={input.decks}
            onClick={input.onHeaderClick}
            sortBy={input.colorSortBy}
            selectedBucket={input.selectedBucket}
            info={input.info}
          />
        </SectionCard>
      </div>

      <RateChartCard {...input} dataset={left} options={options} onChange={setLeftChart} />
      <RateChartCard {...input} dataset={right} options={options} onChange={setRightChart} />

      <ResultsCharts {...input} />
    </div>
  );
}

// RateChartCard is one of the two charts over time, in a card titled with what
// it shows and a dropdown in the corner to pick another measure.
function RateChartCard(input) {
  const picker = (
    <DropdownHeader
      label=""
      options={input.options}
      value={input.dataset}
      onChange={(e) => input.onChange(e.target.value)}
    />
  )

  return (
    <SectionCard title={chartLabel(input.dataset)} action={picker}>
      <ColorRateChart
        parsed={input.parsed}
        colorData={input.parsed.colorData}
        decks={input.decks}
        dataset={input.dataset}
        colorMode={input.colorTypeSelection}
        bucketSize={input.bucketSize}
      />
    </SectionCard>
  )
}

// ResultsCharts are the win rate against the cube average and the matchup
// heatmap. Both are built from match results, so cubes without them skip both.
function ResultsCharts(input) {
  if (!hasData(input.info, "results")) {
    return null
  }

  return (
    <>
      <div className="colors-wide">
        <ColorPerformanceDeltaChart
          parsed={input.parsed}
          colorData={input.parsed.colorData}
          colorTypeSelection={input.colorTypeSelection}
          selectedBucket={input.selectedBucket}
        />
      </div>

      <div className="colors-wide kit-card colors-chart-card">
        <ColorMatchupHeatmap matchupData={input.colorMatchupData} colorType={input.colorTypeSelection} />
      </div>
    </>
  )
}
