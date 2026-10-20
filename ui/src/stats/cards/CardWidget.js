// The Cards stats page and its sections: stats table, trends, plots, and pick
// order. The pieces live in the other files here.

import React from 'react'
import { hasData, visibleItems } from "../../utils/dataKinds.js"
import { Section, SectionNav } from "../../components/PageSections.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import { CardWidgetOptions, CardWidgetTable, matchOpts, tagOpts } from "./CardStatsTable.js"
import { CardGraph } from "./CardScatter.js"
import { ELOChart, PlayRateChart, WinrateChart } from "./CardTrendCharts.js"
import { PickOrderSection } from "./PickOrder.js"
import { CARDS_COPY } from "./copy.js"

// Register chart JS objects that we need to use.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const CARD_SECTIONS = [
  { id: "stats", label: CARDS_COPY.widget.sectionStats },
  { id: "trends", label: CARDS_COPY.widget.sectionTrends },
  { id: "plots", label: CARDS_COPY.widget.sectionPlots },
  { id: "pickorder", label: CARDS_COPY.widget.sectionPickOrder, needs: ["pick_logs"] },
]

export function CardWidget(input) {
  // SectionNav wants the same list object between renders, so the visible
  // sections are only recomputed when the cube's data info changes.
  const sections = React.useMemo(() => visibleItems(CARD_SECTIONS, input.info), [input.info])

  if (!input.show) {
    return null
  }

  let matchInput = {
    "matchOpts": matchOpts,
    "tagOpts": tagOpts,
  }

  return (
    <div className="analyze-page">
      <SectionNav sections={sections} />
      <CardWidgetOptions {...input} {...matchInput} />

      <Section id="stats">
        <h3 className="section-heading">{CARDS_COPY.widget.statsHeading}</h3>
        <CardWidgetTable {...input} />
      </Section>

      <Section id="trends" heading={CARDS_COPY.widget.trendsHeading}>
        <TrendCharts {...input} />
      </Section>

      <Section id="plots" heading={CARDS_COPY.widget.plotsHeading}>
        <CardGraph {...input} />
      </Section>

      <PickOrderPart {...input} />
    </div>
  );
}

// TrendCharts are the Trends section's charts over time. The win rate chart
// needs match results, and the pick ELO chart needs sideboards, since pick
// order is read from what was mainboarded versus sideboarded.
function TrendCharts(input) {
  let winrate = null
  if (hasData(input.info, "results")) {
    winrate = <WinrateChart {...input} />
  }

  let elo = null
  if (hasData(input.info, "sideboards")) {
    elo = <ELOChart {...input} />
  }

  return (
    <>
      {winrate}
      <PlayRateChart {...input} />
      {elo}
    </>
  )
}

// PickOrderPart is the Pick order section, shown only for cubes with pick logs.
function PickOrderPart(input) {
  if (!hasData(input.info, "pick_logs")) {
    return null
  }

  return (
    <Section id="pickorder" heading={CARDS_COPY.widget.pickOrderHeading}>
      <PickOrderSection pickInfo={input.parsed.pickInfo} />
    </Section>
  )
}
