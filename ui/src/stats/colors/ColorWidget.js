// The Colors stats page: the color stats table, the chart over time, and the
// win rate and matchup charts. The pieces live in the other files here.

import React from 'react'
import { MultiSelect } from "@mantine/core"
import { DropdownHeader } from "../../components/Dropdown.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { hasData } from "../../utils/dataKinds.js"
import { colorName } from "../../utils/colorNames.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, SubTitle, Tooltip, Legend } from 'chart.js'
import { ColorStatsTable, TableHeader } from "./ColorStatsTable.js"
import { ColorPerformanceDeltaChart, ColorTrendChart } from "./ColorRateCharts.js"
import { ColorMatchupHeatmap } from "./ColorMatchupHeatmap.js"
import { MAX_PICKED, TREND_MEASURES, groupsFor, needsPicker, shownGroups } from "./colorTrendModel.js"
import { COLORS_COPY } from "./copy.js"

// Register chart JS objects that we need to use.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  SubTitle,
  Tooltip,
  Legend
);

// measureLabel returns a trend measure's label, for its card's title.
function measureLabel(value) {
  for (const option of TREND_MEASURES) {
    if (option.value === value) {
      return option.label
    }
  }
  return TREND_MEASURES[0].label
}

// ColorWidget is the Colors page: the stats table by color, how often each
// color group is built over time, and, for cubes with match results, the win
// rate against the cube average and the matchup heatmap.
export function ColorWidget(input) {
  if (!input.show) {
    return null
  }

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
            confidence={input.winConfidence}
          />
        </SectionCard>
      </div>

      <div className="colors-wide">
        <TrendCard {...input} />
      </div>

      <ResultsCharts {...input} />
    </div>
  );
}

// TrendPicker chooses up to MAX_PICKED color groups for the chart over time,
// for color types with too many groups to draw at once.
function TrendPicker({ colorType, picked, onChange }) {
  if (!needsPicker(colorType)) {
    return null
  }
  const data = groupsFor(colorType).map(group => ({ value: group, label: colorName(group) }))
  return (
    <MultiSelect
      size="xs"
      aria-label={COLORS_COPY.widget.trendPickerLabel}
      placeholder={COLORS_COPY.widget.trendPickerPlaceholder}
      data={data}
      value={picked}
      onChange={onChange}
      maxValues={MAX_PICKED}
      searchable
      className="colors-trend-picker"
    />
  )
}

// TrendCard is the chart over time, titled with its measure, with pickers
// for the measure and, when needed, which color groups to draw.
function TrendCard(input) {
  const [measure, setMeasure] = React.useState("builds")
  const [picked, setPicked] = React.useState([])
  const groups = shownGroups(picked, input.parsed.colorData, input.colorTypeSelection)

  const controls = (
    <div className="colors-trend-controls">
      <TrendPicker colorType={input.colorTypeSelection} picked={groups} onChange={setPicked} />
      <DropdownHeader
        label=""
        options={TREND_MEASURES}
        value={measure}
        onChange={(e) => setMeasure(e.target.value)}
      />
    </div>
  )

  return (
    <SectionCard title={measureLabel(measure)} action={controls}>
      <ColorTrendChart
        buckets={input.parsed.colorDataBucketed}
        groups={groups}
        measure={measure}
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

      <div className="colors-wide">
        <ColorMatchupHeatmap matchupData={input.colorMatchupData} colorType={input.colorTypeSelection} />
      </div>
    </>
  )
}
