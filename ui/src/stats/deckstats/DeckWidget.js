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
import { DECKSTATS_COPY } from "./copy.js"
import "../stats.css"

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
  { label: DECKSTATS_COPY.widget.optionWinsManaCost, value: "wins_mana_cost", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsCreature, value: "wins_creature", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsSorcery, value: "wins_sorcery", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsInstant, value: "wins_instant", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsPlaneswalker, value: "wins_planeswalker", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsEnchantment, value: "wins_enchantment", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsLand, value: "wins_land", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsNonbasic, value: "wins_nonbasic", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsNumColors, value: "wins_num_colors", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionPieNumColors, value: "pie_num_colors" },
  { label: DECKSTATS_COPY.widget.optionDeckAvgMana, value: "deck_avg_mana" },
  { label: DECKSTATS_COPY.widget.optionWinsCounterspells, value: "wins_counterspells", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsRemoval, value: "wins_removal", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsCardDraw, value: "wins_card_draw", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsLifegain, value: "wins_lifegain", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsGraveyard, value: "wins_graveyard", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionWinsDiscard, value: "wins_discard", needs: ["results"] },
  { label: DECKSTATS_COPY.widget.optionTotalBasics, value: "total_basics" },
  { label: DECKSTATS_COPY.widget.optionInteractionColor, value: "interaction_color" },
  { label: DECKSTATS_COPY.widget.optionAvgRemoval, value: "avg_removal" },
  { label: DECKSTATS_COPY.widget.optionAvgCounterspells, value: "avg_counterspells" },
  { label: DECKSTATS_COPY.widget.optionSideboardSize, value: "sideboard_size", needs: ["sideboards"] },
  { label: DECKSTATS_COPY.widget.optionRemovalManaCost, value: "removal_mana_cost" },
  { label: DECKSTATS_COPY.widget.optionAvgColorsTime, value: "avg_colors_time" },
  { label: DECKSTATS_COPY.widget.optionDeckScatter, value: "deck_scatter" },
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
      case "wins_counterspells": return <WinsByOracleText title={DECKSTATS_COPY.widget.titleWinsCounterspells} parsed={input.parsed} decks={input.decks} matches={CounterspellMatches} />;
      case "wins_removal": return <WinsByOracleText title={DECKSTATS_COPY.widget.titleWinsRemoval} parsed={input.parsed} decks={input.decks} matches={RemovalMatches} />;
      case "wins_card_draw": return <WinsByOracleText title={DECKSTATS_COPY.widget.titleWinsCardDraw} parsed={input.parsed} decks={input.decks} matches={cardDrawMatches} />;
      case "wins_lifegain": return <WinsByOracleText title={DECKSTATS_COPY.widget.titleWinsLifegain} parsed={input.parsed} decks={input.decks} matches={lifegainMatches} />;
      case "wins_graveyard": return <WinsByOracleText title={DECKSTATS_COPY.widget.titleWinsGraveyard} parsed={input.parsed} decks={input.decks} matches={["graveyard"]} />;
      case "wins_discard": return <WinsByOracleText title={DECKSTATS_COPY.widget.titleWinsDiscard} parsed={input.parsed} decks={input.decks} matches={["discard"]} />;
      case "total_basics": return <DeckBasicLandCountChart decks={input.decks} parsed={input.parsed} />;
      case "interaction_color": return <OracleTextByColor title={DECKSTATS_COPY.widget.titleInteractionColor} parsed={input.parsed} data={data} />;
      case "avg_removal": return <OracleTextOverTimeChart info={input.info} title={DECKSTATS_COPY.widget.titleAvgRemoval} parsed={input.parsed} matches={RemovalMatches} data={data} />;
      case "avg_counterspells": return <OracleTextOverTimeChart info={input.info} title={DECKSTATS_COPY.widget.titleAvgCounterspells} parsed={input.parsed} matches={CounterspellMatches} data={data} />;
      case "sideboard_size": return <SideboardSizeOverTimeChart decks={input.decks} parsed={input.parsed} />;
      case "removal_mana_cost": return <ManaCostByOracleTextOverTime info={input.info} title={DECKSTATS_COPY.widget.titleRemovalManaCost} parsed={input.parsed} decks={input.decks} matches={RemovalMatches} data={data} />;
      case "avg_colors_time": return <NumColorsOverTimeChart decks={input.decks} parsed={input.parsed} />;
      case "deck_scatter": return <DeckGraph {...input} />;
      default: return null;
    }
  }

  return (
    <div className="analyze-page">
      <div className="controls-panel">
        <div className="selector-group stats-row-centered">
          <DropdownHeader
            label={DECKSTATS_COPY.widget.leftChartLabel}
            options={chartOptions}
            value={left}
            onChange={(e) => setLeftChart(e.target.value)}
          />
          <DropdownHeader
            label={DECKSTATS_COPY.widget.rightChartLabel}
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
