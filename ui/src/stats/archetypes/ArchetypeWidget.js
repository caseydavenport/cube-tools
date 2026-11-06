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

// CHART_OPTIONS are the Trends charts. needs lists the data each is built
// from, so a cube without match results doesn't offer the win charts.
const CHART_OPTIONS = [
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
  { id: "build-shape", label: ARCHETYPES_COPY.widget.sectionBuildShape },
  { id: "trends", label: ARCHETYPES_COPY.widget.sectionTrends },
]

// FinishesPart is the finishes chart under the tables, shown only for cubes
// with match results.
function FinishesPart({ parsed, info }) {
  if (!hasData(info, "results")) {
    return null
  }
  return (
    <>
      <h3 className="section-heading kit-section-title stats-section-gap-lg">{ARCHETYPES_COPY.widget.finishesHeading}</h3>
      <ArchetypeFinishes archetypeData={parsed.archetypeData} />
    </>
  )
}

// BuildShape compares how each macro archetype's decks are built: the mana
// curve, the card types and, with match results, how often their matches go
// to a third game.
function BuildShape({ deckCharts, info }) {
  let closeMatches = null
  if (hasData(info, "results")) {
    closeMatches = <CloseMatchChart deckCharts={deckCharts} />
  }
  return (
    <div className="chart-grid">
      <ManaCurveChart deckCharts={deckCharts} />
      <TypeMixChart deckCharts={deckCharts} />
      {closeMatches}
    </div>
  )
}

export function ArchetypeWidget(input) {
  const [leftChart, setLeftChart] = React.useState("macro_builds")
  const [rightChart, setRightChart] = React.useState("macro_wins")

  if (!input.show) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const chartOptions = visibleItems(CHART_OPTIONS, input.info)
  const left = availableValue(leftChart, CHART_OPTIONS, input.info)
  const right = availableValue(rightChart, CHART_OPTIONS, input.info, left)

  const renderChart = (chartId) => {
    switch (chartId) {
      case "macro_delta": return <MacroArchetypeDeltaChart parsed={input.parsed} />;
      case "macro_builds": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="builds" />;
      case "macro_wins": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="wins" />;
      case "macro_pwin": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="percent_of_wins" />;
      case "macro_winning_pct": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="winning_pct" />;
      case "macro_trophy_pct": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="trophy_pct" />;
      case "macro_lastplace_pct": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="lastplace_pct" />;
      case "macro_cmc": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="cmc" />;
      case "matchup_aggro": return <WinsByMatchup focus="aggro" matchups={input.matchups} />;
      case "matchup_midrange": return <WinsByMatchup focus="midrange" matchups={input.matchups} />;
      case "matchup_control": return <WinsByMatchup focus="control" matchups={input.matchups} />;
      case "micro_builds": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="builds" />;
      case "micro_wins": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="wins" />;
      case "micro_winning_pct": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="winning_pct" />;
      case "micro_trophy_pct": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="trophy_pct" />;
      case "micro_lastplace_pct": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="lastplace_pct" />;
      case "micro_pwin": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="percent_of_wins" />;
      default: return null;
    }
  }

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
        />
        <FinishesPart parsed={input.parsed} info={input.info} />
      </Section>

      <Section id="build-shape" heading={ARCHETYPES_COPY.widget.buildShapeHeading}>
        <BuildShape deckCharts={input.deckCharts} info={input.info} />
      </Section>

      <Section id="trends" heading={ARCHETYPES_COPY.widget.trendsHeading}>
        <div className="controls-panel">
          <div className="selector-group stats-row-centered">
            <DropdownHeader
              label={ARCHETYPES_COPY.widget.leftChart}
              options={chartOptions}
              value={left}
              onChange={(e) => setLeftChart(e.target.value)}
            />
            <DropdownHeader
              label={ARCHETYPES_COPY.widget.rightChart}
              options={chartOptions}
              value={right}
              onChange={(e) => setRightChart(e.target.value)}
            />
          </div>
        </div>
        <div className="chart-grid">
          {renderChart(left)}
          {renderChart(right)}
        </div>
      </Section>
    </div>
  );
}
