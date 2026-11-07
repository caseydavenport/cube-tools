// The Archetypes stats table: its columns, how each cell draws, and how rows sort.

import { ARCHETYPES_COPY } from "./copy.js"
import React from 'react'
import { Link } from "react-router-dom"
import { SegmentedControl } from "@mantine/core"
import { archetypePageHref } from "../../shell/paths.js"
import { OpenInCharts } from "../OpenInCharts.js"
import { MinWinningPctDecks, Pct, SortFunc } from "../../utils/Utils.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { HoverStats } from "../../components/kit/HoverStats.js"
import { WinRateCell } from "../../components/kit/WinRateCell.js"
import { visibleItems } from "../../utils/dataKinds.js"
import { shownTab, splitArchetypes } from "./archetypeTabs.js"
import "../stats.css"

// ARCHETYPE_COLUMNS are the archetype and tag tables' columns. Each draws its
// own header and cell; needs lists the data a column is built from, so cubes
// without match results show no win columns.
const ARCHETYPE_COLUMNS = [
  {
    id: "type",
    text: ARCHETYPES_COPY.statsTable.tag.text,
    tip: ARCHETYPES_COPY.statsTable.tag.tip,
    cell: (t, input) => (
      <td key="type">
        <Link to={archetypePageHref(input.cube, t.type)}>{t.type}</Link>
      </td>
    ),
  },
  {
    id: "num",
    text: ARCHETYPES_COPY.statsTable.decks.text,
    tip: ARCHETYPES_COPY.statsTable.decks.tip,
    cell: (t) => <td key="num">{t.count} <span className="stats-muted">· {t.build_percent.toFixed(0)}%</span></td>,
  },
  {
    id: "winning_pct",
    text: ARCHETYPES_COPY.statsTable.winningPct.text,
    tip: ARCHETYPES_COPY.statsTable.winningPct.tip,
    needs: ["results"],
    cell: (t) => <WinningRecordsCell key="winning_pct" row={t} />,
  },
  {
    id: "bayes_win",
    text: ARCHETYPES_COPY.statsTable.bayesWinPct.text,
    tip: ARCHETYPES_COPY.statsTable.bayesWinPct.tip,
    needs: ["results"],
    cell: (t, input) => <WinRateCell key="bayes_win" record={t} confidence={input.confidence} alwaysMuted />,
  },
  {
    id: "shared",
    text: ARCHETYPES_COPY.statsTable.avgOtherTypes.text,
    tip: ARCHETYPES_COPY.statsTable.avgOtherTypes.tip,
    cell: (t) => <td key="shared">{t.avg_shared}</td>,
  },
];

// winningPercentText is the share of decks with a winning record, or a dash
// when there are too few decks to say.
function winningPercentText(t) {
  if (t.count < MinWinningPctDecks) {
    return ARCHETYPES_COPY.statsTable.tooFewDecks
  }
  return Pct(t.winning, t.count) + "%"
}

// WinningRecordsCell shows the share of a row's decks with a winning match
// record, with how its decks finished on hover: trophies, winning, losing and
// last places.
function WinningRecordsCell({ row }) {
  const rows = [
    { label: ARCHETYPES_COPY.statsTable.trophies, value: row.trophies },
    { label: ARCHETYPES_COPY.statsTable.winning, value: row.winning },
    { label: ARCHETYPES_COPY.statsTable.losing, value: row.losing },
    { label: ARCHETYPES_COPY.statsTable.lastPlace, value: row.last_place },
  ]
  return (
    <HoverStats title={ARCHETYPES_COPY.statsTable.finishesTitle({ decks: row.count })} rows={rows}>
      <td>{winningPercentText(row)}</td>
    </HoverStats>
  )
}

// shownArchetypeSort returns sortBy when one of the shown columns has that id,
// and the deck count otherwise, so rows never sort by a hidden column.
function shownArchetypeSort(sortBy, columns) {
  const ids = columns.map(column => column.id)
  if (ids.includes(sortBy)) {
    return sortBy
  }
  return "num"
}

// archetypeSortValue is the value a row sorts by for the chosen column.
function archetypeSortValue(t, sortBy) {
  switch (sortBy) {
    case "type":
      return t.type
    case "bayes_win":
      return t.bayesian_win_percent
    case "shared":
      return t.avg_shared
    case "winning_pct":
      if (t.count >= MinWinningPctDecks) {
        return t.winning / t.count
      }
      return -1
  }
  return t.count
}


function ArchetypeTableHeader(input) {
  return (
    <thead className="table-header">
      <tr>
        {
          input.columns.map(function(hdr) {
            return (
              <HoverInfo key={hdr.id} title={hdr.text} info={hdr.tip}>
                <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
              </HoverInfo>
            );
          })
        }
      </tr>
    </thead>
  );
}

function ArchetypeTableRows(input) {
  return (
    <tbody>
      {
        input.data.map(function(t) {
          return (
            <tr key={t.type} sort={archetypeSortValue(t, shownArchetypeSort(input.sortBy, input.columns))} className="widget-table-row">
              {input.columns.map(column => column.cell(t, input))}
            </tr>
          )
        }).sort(SortFunc)
      }
    </tbody>
  );
}

// TABLE_TABS are the two tables the Archetypes section switches between, with
// the Charts dimension each one opens on.
const TABLE_TABS = [
  { value: "archetypes", label: ARCHETYPES_COPY.statsTable.archetypesHeading, dim: "archetype" },
  { value: "tags", label: ARCHETYPES_COPY.statsTable.tagsHeading, dim: "label" },
]

// TableTabs is the switch between the archetypes and tags tables, with a link
// opening the Charts page grouped the same way. The tags tab only shows when
// some tag is common enough to list.
function TableTabs({ tab, onTab, hasTags }) {
  let tabs = TABLE_TABS
  if (!hasTags) {
    tabs = TABLE_TABS.filter(t => t.value === "archetypes")
  }
  const shown = tabs.find(t => t.value === tab) || tabs[0]
  return (
    <div className="archetype-table-title">
      <SegmentedControl
        size="xs"
        aria-label={ARCHETYPES_COPY.statsTable.tableTabsLabel}
        data={tabs.map(t => ({ value: t.value, label: t.label }))}
        value={shown.value}
        onChange={onTab}
      />
      <OpenInCharts slice={{ groupBy: { dim: shown.dim, granularity: 1, color_mode: "inclusive" } }} />
    </div>
  )
}

// tabColumns names the first column for the tab: "Archetype" on the
// archetypes tab, "Tag" on the tags tab.
function tabColumns(columns, tab) {
  if (tab !== "archetypes") {
    return columns
  }
  return columns.map(column => {
    if (column.id !== "type") {
      return column
    }
    return { ...column, text: ARCHETYPES_COPY.statsTable.archetype.text, tip: ARCHETYPES_COPY.statsTable.archetype.tip }
  })
}

// ArchetypeStatsTable shows one table at a time, the macro archetypes or the
// tags, picked by input.tab and switched with input.onTab.
export function ArchetypeStatsTable(input) {
  const { macroData, microData } = splitArchetypes(input.parsed.archetypeData)
  const hasTags = microData.length > 0
  const tab = shownTab(input.tab, hasTags)
  const columns = tabColumns(visibleItems(ARCHETYPE_COLUMNS, input.info), tab)

  let rows = macroData
  if (tab === "tags") {
    rows = microData
  }

  return (
    <div>
      <TableTabs tab={tab} onTab={input.onTab} hasTags={hasTags} />
      <div className="table-scroll">
        <table className="widget-table">
          <ArchetypeTableHeader columns={columns} onHeaderClick={input.onHeaderClick} />
          <ArchetypeTableRows columns={columns} data={rows} sortBy={input.sortBy} cube={input.cube} confidence={input.confidence} />
        </table>
      </div>
    </div>
  );
}
