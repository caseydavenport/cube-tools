// The Cards stats page and its tabs: the stats table, plots, and pick order.
// The pieces live in the other files here.

import React from 'react'
import { hasData, visibleItems } from "../../utils/dataKinds.js"
import { useCube } from "../../contexts/CubeContext.js"
import { useCubeTags } from "../useCubeTags.js"
import { TabNav } from "../../components/PageSections.js"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import { CardWidgetOptions, CardWidgetTable, cubeCobraTags } from "./CardStatsTable.js"
import { CardGraph } from "./CardScatter.js"
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

// CARD_TABS are the Cards page's tabs. Pick order needs draft pick logs.
const CARD_TABS = [
  { id: "stats", label: CARDS_COPY.widget.sectionStats },
  { id: "plots", label: CARDS_COPY.widget.sectionPlots },
  { id: "pickorder", label: CARDS_COPY.widget.sectionPickOrder, needs: ["pick_logs"] },
]

// shownTab is the tab on screen: tab when the cube offers it, else the first.
function shownTab(tab, tabs) {
  if (tabs.some(t => t.id === tab)) {
    return tab
  }
  return tabs[0].id
}

// CardWidget is the Cards page: the card filters, then one tab at a time,
// the stats table, the plots, or pick order.
export function CardWidget(input) {
  const [tab, setTab] = React.useState("stats")
  const tabs = React.useMemo(() => visibleItems(CARD_TABS, input.info), [input.info])
  const cubeTags = useCubeTags(useCube())

  if (!input.show) {
    return null
  }

  const shown = shownTab(tab, tabs)
  const tagInput = {
    cubeCobraTags,
    cubeTags,
  }

  // The card filters drive the table and the plots; pick order ignores them.
  let options = null
  if (shown !== "pickorder") {
    options = <CardWidgetOptions {...input} {...tagInput} />
  }

  return (
    <div className="analyze-page">
      <TabNav tabs={tabs} active={shown} onChange={setTab} />
      {options}
      <CardTab tab={shown} input={input} />
    </div>
  );
}

// CardTab is the content of the shown tab.
function CardTab({ tab, input }) {
  if (tab === "plots") {
    return <CardGraph {...input} />
  }
  if (tab === "pickorder" && hasData(input.info, "pick_logs")) {
    return <PickOrderSection pickInfo={input.parsed.pickInfo} />
  }
  return <CardWidgetTable {...input} />
}
