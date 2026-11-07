// The Archetypes stats page: the archetype table, top cards, and the charts.
// The pieces live in the other files here.

import { ARCHETYPES_COPY } from "./copy.js"
import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { availableValue, hasData, visibleItems } from "../../utils/dataKinds.js"
import { Section, SectionNav } from "../../components/PageSections.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { MacroArchetypeDeltaChart, MacroArchetypesChart } from "./ArchetypeCharts.js"
import { WinsByMatchup } from "./WinsByMatchup.js"
import { MicroArchetypesChart } from "./TagCharts.js"
import { ArchetypeStatsTable } from "./ArchetypeStatsTable.js"
import { shownTab, splitArchetypes } from "./archetypeTabs.js"
import { ArchetypeFinishes } from "./ArchetypeFinishes.js"
import { ManaCurveChart, TypeMixChart } from "../deckstats/BuildShapeCharts.js"
import { CloseMatchChart } from "../deckstats/HeadToHeadCharts.js"
import "../stats.css"

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

// CHART_OPTIONS are the charts the Charts section's dropdown offers: how each
// macro archetype's decks are built, then how archetypes and tags change over
// time. needs lists the data each is built from, so a cube without match
// results doesn't offer the win charts.
const CHART_OPTIONS = [
  { label: ARCHETYPES_COPY.widget.chartManaCurve, value: "mana_curve" },
  { label: ARCHETYPES_COPY.widget.chartTypeMix, value: "type_mix" },
  { label: ARCHETYPES_COPY.widget.chartCloseMatches, value: "close_matches", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartDelta, value: "macro_delta", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartBuilds, value: "macro_builds" },
  { label: ARCHETYPES_COPY.widget.chartWins, value: "macro_wins", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartPercentOfWins, value: "macro_pwin", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartWinningPct, value: "macro_winning_pct", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartTrophyPct, value: "macro_trophy_pct", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartLastPlacePct, value: "macro_lastplace_pct", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.chartCmc, value: "macro_cmc" },
  { label: ARCHETYPES_COPY.widget.matchupAggro, value: "matchup_aggro", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.matchupMidrange, value: "matchup_midrange", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.matchupControl, value: "matchup_control", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.tagBuilds, value: "micro_builds" },
  { label: ARCHETYPES_COPY.widget.tagWins, value: "micro_wins", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.tagWinningPct, value: "micro_winning_pct", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.tagTrophyPct, value: "micro_trophy_pct", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.tagLastPlacePct, value: "micro_lastplace_pct", needs: ["results"] },
  { label: ARCHETYPES_COPY.widget.tagPercentOfWins, value: "micro_pwin", needs: ["results"] },
]

const ARCH_SECTIONS = [
  { id: "archetypes", label: ARCHETYPES_COPY.widget.sectionArchetypes },
  { id: "charts", label: ARCHETYPES_COPY.widget.sectionCharts },
]

// FinishesPart is the finishes chart under the archetypes table, shown only
// for cubes with match results. It compares the macro archetypes, so the tags
// tab leaves it out.
function FinishesPart({ parsed, info, tab }) {
  if (!hasData(info, "results") || tab !== "archetypes") {
    return null
  }
  return (
    <>
      <h3 className="section-heading kit-section-title stats-section-gap-lg">{ARCHETYPES_COPY.widget.finishesHeading}</h3>
      <ArchetypeFinishes archetypeData={parsed.archetypeData} />
      <p className="stats-muted-small">{ARCHETYPES_COPY.widget.finishesNote}</p>
    </>
  )
}

// trendChart draws one of the over-time charts for chartId: the macro
// archetypes' or the tags' dataset per time bucket.
function trendChart(chartId, input) {
  const common = { parsed: input.parsed, decks: input.decks, bucketSize: input.bucketSize }
  switch (chartId) {
    case "macro_builds": return <MacroArchetypesChart {...common} dataset="builds" />
    case "macro_wins": return <MacroArchetypesChart {...common} dataset="wins" />
    case "macro_pwin": return <MacroArchetypesChart {...common} dataset="percent_of_wins" />
    case "macro_winning_pct": return <MacroArchetypesChart {...common} dataset="winning_pct" />
    case "macro_trophy_pct": return <MacroArchetypesChart {...common} dataset="trophy_pct" />
    case "macro_lastplace_pct": return <MacroArchetypesChart {...common} dataset="lastplace_pct" />
    case "macro_cmc": return <MacroArchetypesChart {...common} dataset="cmc" />
    case "micro_builds": return <MicroArchetypesChart {...common} dataset="builds" />
    case "micro_wins": return <MicroArchetypesChart {...common} dataset="wins" />
    case "micro_winning_pct": return <MicroArchetypesChart {...common} dataset="winning_pct" />
    case "micro_trophy_pct": return <MicroArchetypesChart {...common} dataset="trophy_pct" />
    case "micro_lastplace_pct": return <MicroArchetypesChart {...common} dataset="lastplace_pct" />
    case "micro_pwin": return <MicroArchetypesChart {...common} dataset="percent_of_wins" />
    default: return null
  }
}

// renderChart draws the chart chosen in the dropdown: a build-shape chart, the
// win rate against average, a matchup chart, or an over-time chart.
function renderChart(chartId, input) {
  switch (chartId) {
    case "mana_curve": return <ManaCurveChart deckCharts={input.deckCharts} />
    case "type_mix": return <TypeMixChart deckCharts={input.deckCharts} />
    case "close_matches": return <CloseMatchChart deckCharts={input.deckCharts} />
    case "macro_delta": return <MacroArchetypeDeltaChart parsed={input.parsed} />
    case "matchup_aggro": return <WinsByMatchup focus="aggro" matchups={input.matchups} />
    case "matchup_midrange": return <WinsByMatchup focus="midrange" matchups={input.matchups} />
    case "matchup_control": return <WinsByMatchup focus="control" matchups={input.matchups} />
    default: return trendChart(chartId, input)
  }
}

export function ArchetypeWidget(input) {
  const [chart, setChart] = React.useState("mana_curve")
  const [tab, setTab] = React.useState("archetypes")

  if (!input.show) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const chartOptions = visibleItems(CHART_OPTIONS, input.info)
  const shown = availableValue(chart, CHART_OPTIONS, input.info)

  // The tags tab falls back to archetypes when no tag is common enough to list.
  const hasTags = splitArchetypes(input.parsed.archetypeData).microData.length > 0
  const visibleTab = shownTab(tab, hasTags)

  return (
    <div className="analyze-page">
      <SectionNav sections={ARCH_SECTIONS} />

      <Section id="archetypes">
        <ArchetypeStatsTable
          parsed={input.parsed}
          decks={input.decks}
          dropdownSelection={input.colorTypeSelection}
          sortBy={input.sortBy}
          onHeaderClick={input.onHeaderClick}
          cube={input.cubeID}
          info={input.info}
          confidence={input.winConfidence}
          tab={tab}
          onTab={setTab}
        />
        <FinishesPart parsed={input.parsed} info={input.info} tab={visibleTab} />
      </Section>

      <Section id="charts" heading={ARCHETYPES_COPY.widget.chartsHeading}>
        <div className="controls-panel">
          <div className="selector-group stats-row-centered">
            <DropdownHeader
              label={ARCHETYPES_COPY.widget.chartLabel}
              options={chartOptions}
              value={shown}
              onChange={(e) => setChart(e.target.value)}
            />
          </div>
        </div>
        <div className="single-chart">
          {renderChart(shown, input)}
        </div>
      </Section>
    </div>
  );
}
