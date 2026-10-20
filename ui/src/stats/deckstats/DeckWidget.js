// The Deck stats page: two chart pickers and the deck scatter plot. The
// charts live in the other files here.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement } from 'chart.js'
import { availableValue, visibleItems } from "../../utils/dataKinds.js"
import { WinsByCardType, WinsByManaCost, WinsByNonBasicLandDensity } from "./WinsByDeckShape.js"
import { WinsByNumberOfColors, WinsByOracleText } from "./WinsByTextAndColors.js"
import { DeckBasicLandCountChart, DeckManaValueChart, NumColorsOverTimeChart, NumColorsPieChart, SideboardSizeOverTimeChart } from "./DeckShapeCharts.js"
import { CounterspellMatches, RemovalMatches, cardDrawMatches, lifegainMatches } from "../../utils/cardMatches.js"
import { ManaCostByOracleTextOverTime, OracleTextByColor, OracleTextOverTimeChart } from "./OracleTextCharts.js"
import { DeckGraph } from "./DeckScatter.js"

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

// DECK_CHART_OPTIONS are the charts the two pickers offer. needs lists the data
// a chart is built from: the wins charts need match results, and the
// sideboard size chart needs sideboards.
const DECK_CHART_OPTIONS = [
  { label: "Wins by Mana Cost", value: "wins_mana_cost", needs: ["results"] },
  { label: "Wins by # Creatures", value: "wins_creature", needs: ["results"] },
  { label: "Wins by # Sorceries", value: "wins_sorcery", needs: ["results"] },
  { label: "Wins by # Instants", value: "wins_instant", needs: ["results"] },
  { label: "Wins by # Planeswalkers", value: "wins_planeswalker", needs: ["results"] },
  { label: "Wins by # Enchantments", value: "wins_enchantment", needs: ["results"] },
  { label: "Wins by # Lands", value: "wins_land", needs: ["results"] },
  { label: "Wins by # Non-basic Lands", value: "wins_nonbasic", needs: ["results"] },
  { label: "Wins by # Colors", value: "wins_num_colors", needs: ["results"] },
  { label: "Pie: # Colors", value: "pie_num_colors" },
  { label: "Deck Avg. Mana Value", value: "deck_avg_mana" },
  { label: "Wins by # Counterspells", value: "wins_counterspells", needs: ["results"] },
  { label: "Wins by # Removal", value: "wins_removal", needs: ["results"] },
  { label: "Wins by # Card Draw", value: "wins_card_draw", needs: ["results"] },
  { label: "Wins by # Lifegain", value: "wins_lifegain", needs: ["results"] },
  { label: "Wins by # Graveyard", value: "wins_graveyard", needs: ["results"] },
  { label: "Wins by # Discard", value: "wins_discard", needs: ["results"] },
  { label: "Avg. Basics per Deck", value: "total_basics" },
  { label: "Interaction by Color", value: "interaction_color" },
  { label: "Avg. Removal per-deck", value: "avg_removal" },
  { label: "Avg. Counterspells per-deck", value: "avg_counterspells" },
  { label: "Sideboard Size", value: "sideboard_size", needs: ["sideboards"] },
  { label: "Removal Mana Cost", value: "removal_mana_cost" },
  { label: "Avg. # Colors over time", value: "avg_colors_time" },
  { label: "Deck Scatter Plot", value: "deck_scatter" },
]

export function DeckWidget(input) {
  const [leftChart, setLeftChart] = React.useState("wins_mana_cost")
  const [rightChart, setRightChart] = React.useState("wins_creature")

  if (!input.show) {
    return null
  }

  // Pre-calcualte much of the graph data, to avoid needing to do so multiple times.
  let data = input.graphData

  // Wait for data to be parsed and available before attempting to display any graphs.
  if (!data) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const chartOptions = visibleItems(DECK_CHART_OPTIONS, input.info)
  const left = availableValue(leftChart, DECK_CHART_OPTIONS, input.info)
  const right = availableValue(rightChart, DECK_CHART_OPTIONS, input.info, left)

  const renderChart = (chartId) => {
    switch (chartId) {
      case "wins_mana_cost": return <WinsByManaCost decks={input.decks} data={data} />;
      case "wins_creature": return <WinsByCardType type="Creature" decks={input.decks} />;
      case "wins_sorcery": return <WinsByCardType type="Sorcery" decks={input.decks} />;
      case "wins_instant": return <WinsByCardType type="Instant" decks={input.decks} />;
      case "wins_planeswalker": return <WinsByCardType type="Planeswalker" bucketSize={1} decks={input.decks} />;
      case "wins_enchantment": return <WinsByCardType type="Enchantment" decks={input.decks} />;
      case "wins_land": return <WinsByCardType type="Land" bucketSize={1} decks={input.decks} />;
      case "wins_nonbasic": return <WinsByNonBasicLandDensity decks={input.decks} data={data} />;
      case "wins_num_colors": return <WinsByNumberOfColors decks={input.decks} />;
      case "pie_num_colors": return <NumColorsPieChart decks={input.decks} parsed={input.parsed} />;
      case "deck_avg_mana": return <DeckManaValueChart decks={input.decks} parsed={input.parsed} />;
      case "wins_counterspells": return <WinsByOracleText title="Wins by # counterspells" parsed={input.parsed} decks={input.decks} matches={CounterspellMatches} />;
      case "wins_removal": return <WinsByOracleText title="Wins by # removal spells" parsed={input.parsed} decks={input.decks} matches={RemovalMatches} />;
      case "wins_card_draw": return <WinsByOracleText title="Wins by # card draw spells" parsed={input.parsed} decks={input.decks} matches={cardDrawMatches} />;
      case "wins_lifegain": return <WinsByOracleText title="Wins by # lifegain spells" parsed={input.parsed} decks={input.decks} matches={lifegainMatches} />;
      case "wins_graveyard": return <WinsByOracleText title="Wins by graveyard interaction" parsed={input.parsed} decks={input.decks} matches={["graveyard"]} />;
      case "wins_discard": return <WinsByOracleText title="Wins by # discard spells" parsed={input.parsed} decks={input.decks} matches={["discard"]} />;
      case "total_basics": return <DeckBasicLandCountChart decks={input.decks} parsed={input.parsed} />;
      case "interaction_color": return <OracleTextByColor title="Interaction by color" parsed={input.parsed} data={data} />;
      case "avg_removal": return <OracleTextOverTimeChart info={input.info} title="Avg. removal per-deck" parsed={input.parsed} matches={RemovalMatches} data={data} />;
      case "avg_counterspells": return <OracleTextOverTimeChart info={input.info} title="Avg. counterspells per-deck" parsed={input.parsed} matches={CounterspellMatches} data={data} />;
      case "sideboard_size": return <SideboardSizeOverTimeChart decks={input.decks} parsed={input.parsed} />;
      case "removal_mana_cost": return <ManaCostByOracleTextOverTime info={input.info} title="Removal mana cost" parsed={input.parsed} decks={input.decks} matches={RemovalMatches} data={data} />;
      case "avg_colors_time": return <NumColorsOverTimeChart decks={input.decks} parsed={input.parsed} />;
      case "deck_scatter": return <DeckGraph {...input} />;
      default: return null;
    }
  }

  return (
    <div className="analyze-page">
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
    </div>
  )
}
