// The Colors stats page: the color controls and the tabs for the stats table,
// the chart over time, finishes, net performance and matchups. The pieces live
// in the other files here.

import React from 'react'
import { MultiSelect } from "@mantine/core"
import { ChoiceHeader } from "../../components/Dropdown.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { TabNav } from "../../components/PageSections.js"
import { visibleItems } from "../../utils/dataKinds.js"
import { colorName } from "../../utils/colorNames.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, SubTitle, Tooltip, Legend } from 'chart.js'
import { ColorStatsTable, TableHeader } from "./ColorStatsTable.js"
import { ColorPerformanceDeltaChart, ColorTrendChart, selectedColorRows } from "./ColorRateCharts.js"
import { ColorMatchupHeatmap } from "./ColorMatchupHeatmap.js"
import { FinishesChart } from "../finishes/FinishesChart.js"
import { colorFinishRows } from "./colorFinishes.js"
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

// COLOR_TABS are the Colors page's tabs. The last three are built from match
// results, so cubes without them don't offer them.
const COLOR_TABS = [
  { id: "table", label: COLORS_COPY.widget.tabTable },
  { id: "trend", label: COLORS_COPY.widget.tabTrend },
  { id: "finishes", label: COLORS_COPY.widget.tabFinishes, needs: ["results"] },
  { id: "net", label: COLORS_COPY.widget.tabNet, needs: ["results"] },
  { id: "matchups", label: COLORS_COPY.widget.tabMatchups, needs: ["results"] },
]

// ColorWidget is the Colors page: the color controls, then one tab at a time,
// the stats table, how often each group is built over time, how their decks
// finished, the win rate against average, or the matchup heatmap.
export function ColorWidget(input) {
  const [tab, setTab] = React.useState("table")
  const tabs = React.useMemo(() => visibleItems(COLOR_TABS, input.info), [input.info])

  if (!input.show) {
    return null
  }

  let shown = tabs[0].id
  if (tabs.some(t => t.id === tab)) {
    shown = tab
  }

  return (
    <div className="analyze-page">
      <TabNav tabs={tabs} active={shown} onChange={setTab} />
      <div className="controls-panel">
        <TableHeader {...input} />
      </div>
      <ColorTab tab={shown} input={input} />
    </div>
  );
}

// ColorTab is the content of the shown tab.
function ColorTab({ tab, input }) {
  if (tab === "trend") {
    return <TrendCard {...input} />
  }
  if (tab === "finishes") {
    return <FinishesCard {...input} />
  }
  if (tab === "net") {
    return (
      <ColorPerformanceDeltaChart
        parsed={input.parsed}
        colorData={input.parsed.colorData}
        colorTypeSelection={input.colorTypeSelection}
        selectedBucket={input.selectedBucket}
      />
    )
  }
  if (tab === "matchups") {
    return <ColorMatchupHeatmap matchupData={input.colorMatchupData} colorType={input.colorTypeSelection} colorMode={input.colorMode} />
  }
  return (
    <SectionCard title={input.copy.colorStats}>
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
  )
}

// FinishesCard shows how each color group's decks finished, for the shown
// color type and time bucket, with a note that the differences are mostly
// chance.
function FinishesCard(input) {
  const rows = selectedColorRows(input.parsed.colorData, input.parsed.colorDataBucketed, input.selectedBucket)
  const byColor = new Map(rows.map(row => [row.color, row]))
  return (
    <SectionCard title={COLORS_COPY.widget.finishesTitle}>
      <FinishesChart rows={colorFinishRows(byColor, input.colorTypeSelection)} />
      <p className="stats-muted-small">{COLORS_COPY.widget.finishesNote}</p>
    </SectionCard>
  )
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
      <ChoiceHeader
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

