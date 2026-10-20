// The Archetypes stats page: the archetype table, top cards, and the charts.
// The pieces live in the other files here.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { availableValue, visibleItems } from "../../utils/dataKinds.js"
import { Section, SectionNav } from "../../components/PageSections.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js'
import { MacroArchetypeDeltaChart, MacroArchetypesChart, MacroArchetypesPieChart } from "./ArchetypeCharts.js"
import { WinsByMatchup } from "./WinsByMatchup.js"
import { MicroArchetypesChart } from "./TagCharts.js"
import { ArchetypeDetailsPanel, ColorPickerHeader, TopCardsInArchetypeWidget } from "./TopCardsInArchetype.js"
import { ArchetypeStatsTable } from "./ArchetypeStatsTable.js"

// Register chart JS objects that we need to use.
ChartJS.register(
  ArcElement,
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
  { label: "Archetype Δ vs avg", value: "macro_delta", needs: ["results"] },
  { label: "Archetype Build %", value: "macro_builds" },
  { label: "Archetype Win %", value: "macro_wins", needs: ["results"] },
  { label: "Archetype % of wins", value: "macro_pwin", needs: ["results"] },
  { label: "Archetype Winning %", value: "macro_winning_pct", needs: ["results"] },
  { label: "Archetype Trophy %", value: "macro_trophy_pct", needs: ["results"] },
  { label: "Archetype Last Place %", value: "macro_lastplace_pct", needs: ["results"] },
  { label: "Archetype CMC", value: "macro_cmc" },
  { label: "Matchup: Aggro", value: "matchup_aggro", needs: ["results"] },
  { label: "Matchup: Midrange", value: "matchup_midrange", needs: ["results"] },
  { label: "Matchup: Control", value: "matchup_control", needs: ["results"] },
  { label: "Pie: Builds", value: "pie_builds" },
  { label: "Pie: Wins", value: "pie_wins", needs: ["results"] },
  { label: "Tag Build %", value: "micro_builds" },
  { label: "Tag Win %", value: "micro_wins", needs: ["results"] },
  { label: "Tag Winning %", value: "micro_winning_pct", needs: ["results"] },
  { label: "Tag Trophy %", value: "micro_trophy_pct", needs: ["results"] },
  { label: "Tag Last Place %", value: "micro_lastplace_pct", needs: ["results"] },
  { label: "Tag % of wins", value: "micro_pwin", needs: ["results"] },
]

const ARCH_SECTIONS = [
  { id: "archetypes", label: "Archetypes" },
  { id: "selected-archetype", label: "Selected Archetype" },
  { id: "trends", label: "Trends" },
]

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
      case "pie_builds": return <MacroArchetypesPieChart parsed={input.parsed} decks={input.decks} dataset="builds" />;
      case "pie_wins": return <MacroArchetypesPieChart parsed={input.parsed} decks={input.decks} dataset="wins" />;
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

      <div className="controls-panel">
        <span className="section-heading">Colors</span>
        <ColorPickerHeader display={input.colorCheckboxes} onChecked={input.onColorChecked} />
      </div>

      <Section id="archetypes">
        <ArchetypeStatsTable
          parsed={input.parsed}
          decks={input.decks}
          dropdownSelection={input.colorTypeSelection}
          sortBy={input.sortBy}
          onHeaderClick={input.onHeaderClick}
          handleRowClick={input.handleRowClick}
          selectedArchetype={input.selectedArchetype}
          info={input.info}
        />
      </Section>

      <Section id="selected-archetype" heading={`Selected — ${input.selectedArchetype}`}>
        <TopCardsInArchetypeWidget
          parsed={input.parsed}
          cardData={input.cardData}
          decks={input.decks}
          minDrafts={input.minDrafts}
          cube={input.cube}
          minDecksInArch={input.minDecksInArch}
          archetypeDropdownOptions={input.archetypeDropdownOptions}
          selectedArchetype={input.selectedArchetype}
          onArchetypeSelected={input.onArchetypeSelected}
          colorWidgetOpts={input.colorWidgetOpts}
          onColorSelected={input.onColorSelected}
          colorSelection={input.colorSelection}
          onMinDraftsSelected={input.onMinDraftsSelected}
          onMinGamesSelected={input.onMinGamesSelected}
        />
        <ArchetypeDetailsPanel
          parsed={input.parsed}
          decks={input.decks}
          selectedArchetype={input.selectedArchetype}
        />
      </Section>

      <Section id="trends" heading="Trends">
        <div className="controls-panel">
          <div className="selector-group" style={{"justifyContent": "center"}}>
            <DropdownHeader
              label="Left Chart"
              options={chartOptions}
              value={left}
              onChange={(e) => setLeftChart(e.target.value)}
            />
            <DropdownHeader
              label="Right Chart"
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
