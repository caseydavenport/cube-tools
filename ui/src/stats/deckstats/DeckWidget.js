// The Deck stats page: two chart pickers and the deck scatter plot. The
// charts live in the other files here.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement } from 'chart.js'
import { availableValue, visibleItems } from "../../utils/dataKinds.js"
import { CloseMatchChart, HeadToHeadChart } from "./HeadToHeadCharts.js"
import { ForestPlot } from "./ForestPlot.js"
import { ManaCurveChart, SplashSizeChart, TypeMixChart } from "./BuildShapeCharts.js"
import { DeckBasicLandCountChart, DeckManaValueChart, NumColorsOverTimeChart, NumColorsPieChart, SideboardSizeOverTimeChart } from "./DeckShapeCharts.js"
import { CounterspellMatches, RemovalMatches } from "../../utils/cardMatches.js"
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
// a chart is built from: the head-to-head charts need match results, and the
// sideboard size chart needs sideboards.
const DECK_CHART_OPTIONS = [
  { label: "Forest plot: what moves win rate", value: "forest_plot" },
  { label: "Head to head", value: "head_to_head", needs: ["results"] },
  { label: "Close matches by archetype", value: "close_matches", needs: ["results"] },
  { label: "Mana curve by archetype", value: "mana_curve" },
  { label: "Card types by archetype", value: "type_mix" },
  { label: "Splash size", value: "splash_size" },
  { label: DECKSTATS_COPY.widget.optionPieNumColors, value: "pie_num_colors" },
  { label: DECKSTATS_COPY.widget.optionDeckAvgMana, value: "deck_avg_mana" },
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
  const [leftChart, setLeftChart] = React.useState("forest_plot")
  const [rightChart, setRightChart] = React.useState("head_to_head")

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
      case "forest_plot": return <ForestPlot deckCharts={input.deckCharts} />;
      case "head_to_head": return <HeadToHeadChart deckCharts={input.deckCharts} />;
      case "close_matches": return <CloseMatchChart deckCharts={input.deckCharts} />;
      case "mana_curve": return <ManaCurveChart deckCharts={input.deckCharts} />;
      case "type_mix": return <TypeMixChart deckCharts={input.deckCharts} />;
      case "splash_size": return <SplashSizeChart deckCharts={input.deckCharts} />;
      case "pie_num_colors": return <NumColorsPieChart decks={input.decks} parsed={input.parsed} />;
      case "deck_avg_mana": return <DeckManaValueChart decks={input.decks} parsed={input.parsed} />;
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
