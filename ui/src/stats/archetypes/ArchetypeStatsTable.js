// The Archetypes stats table: its columns, how each cell draws, and how rows sort.

import { ARCHETYPES_COPY } from "./copy.js"
import React from 'react'
import { MinWinningPctDecks, Pct, SortFunc } from "../../utils/Utils.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { HoverStats } from "../../components/kit/HoverStats.js"
import { visibleItems } from "../../utils/dataKinds.js"
import { macroArchetypes, watermark } from "./archetypeHelpers.js"
import "../stats.css"

// ARCHETYPE_COLUMNS are the archetype and tag tables' columns. Each draws its
// own header and cell; needs lists the data a column is built from, so cubes
// without match results show no win columns.
const ARCHETYPE_COLUMNS = [
  {
    id: "type",
    text: ARCHETYPES_COPY.statsTable.tag.text,
    tip: ARCHETYPES_COPY.statsTable.tag.tip,
    cell: (t, input) => <td id={t.type} onClick={input.handleRowClick} key="type">{t.type}</td>,
  },
  {
    id: "build_percent",
    text: ARCHETYPES_COPY.statsTable.buildPct.text,
    tip: ARCHETYPES_COPY.statsTable.buildPct.tip,
    cell: (t) => <td key="build_percent">{t.build_percent.toFixed(0)}%</td>,
  },
  {
    id: "win_percent",
    text: ARCHETYPES_COPY.statsTable.winPct.text,
    tip: ARCHETYPES_COPY.statsTable.winPct.tip,
    needs: ["results"],
    cell: (t) => <ArchetypeWinCell key="win_percent" stats={t} />,
  },
  {
    id: "bayes_win",
    text: ARCHETYPES_COPY.statsTable.bayesWinPct.text,
    tip: ARCHETYPES_COPY.statsTable.bayesWinPct.tip,
    needs: ["results"],
    cell: (t) => <td key="bayes_win">{t.bayesian_win_percent.toFixed(0)}%</td>,
  },
  {
    id: "pwin",
    text: ARCHETYPES_COPY.statsTable.percentOfWins.text,
    tip: ARCHETYPES_COPY.statsTable.percentOfWins.tip,
    needs: ["results"],
    cell: (t) => <td key="pwin">{t.percent_of_wins.toFixed(0)}%</td>,
  },
  {
    id: "trophies",
    text: ARCHETYPES_COPY.statsTable.trophies.text,
    tip: ARCHETYPES_COPY.statsTable.trophies.tip,
    needs: ["results"],
    cell: (t) => <td key="trophies">{t.trophies}</td>,
  },
  {
    id: "lastplace",
    text: ARCHETYPES_COPY.statsTable.lastPlace.text,
    tip: ARCHETYPES_COPY.statsTable.lastPlace.tip,
    needs: ["results"],
    cell: (t) => <td key="lastplace">{t.last_place}</td>,
  },
  {
    id: "winning",
    text: ARCHETYPES_COPY.statsTable.winning.text,
    tip: ARCHETYPES_COPY.statsTable.winning.tip,
    needs: ["results"],
    cell: (t) => <td key="winning">{t.winning}</td>,
  },
  {
    id: "losing",
    text: ARCHETYPES_COPY.statsTable.losing.text,
    tip: ARCHETYPES_COPY.statsTable.losing.tip,
    needs: ["results"],
    cell: (t) => <td key="losing">{t.losing}</td>,
  },
  {
    id: "winning_pct",
    text: ARCHETYPES_COPY.statsTable.winningPct.text,
    tip: ARCHETYPES_COPY.statsTable.winningPct.tip,
    needs: ["results"],
    cell: (t) => <td key="winning_pct">{winningPercentText(t)}</td>,
  },
  {
    id: "num",
    text: ARCHETYPES_COPY.statsTable.numDecks.text,
    tip: ARCHETYPES_COPY.statsTable.numDecks.tip,
    cell: (t) => <td key="num">{t.count}</td>,
  },
  {
    id: "shared",
    text: ARCHETYPES_COPY.statsTable.avgOtherTypes.text,
    tip: ARCHETYPES_COPY.statsTable.avgOtherTypes.tip,
    cell: (t) => <td key="shared">{t.avg_shared}</td>,
  },
  {
    id: "avg_word_count",
    text: ARCHETYPES_COPY.statsTable.avgWords.text,
    tip: ARCHETYPES_COPY.statsTable.avgWords.tip,
    cell: (t) => <td key="avg_word_count">{t.avg_word_count}</td>,
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

// ArchetypeWinCell shows a win rate, greyed when it can't be told apart from a
// coin flip, with the confidence interval on hover.
function ArchetypeWinCell({ stats }) {
  if (stats.win_percent_low == null) {
    return <td>{stats.win_percent.toFixed(0)}%</td>
  }

  let style = undefined
  let verdict = ARCHETYPES_COPY.statsTable.distinguishable
  if (!stats.significant) {
    style = { color: "var(--se-muted)" }
    verdict = ARCHETYPES_COPY.statsTable.notDistinguishable
  }
  const rows = [{
    label: ARCHETYPES_COPY.statsTable.winIntervalLabel,
    value: ARCHETYPES_COPY.statsTable.winInterval({
      low: stats.win_percent_low.toFixed(0),
      high: stats.win_percent_high.toFixed(0),
    }),
  }]

  return (
    <HoverStats rows={rows} footer={verdict}>
      <td style={style}>{stats.win_percent.toFixed(0)}%</td>
    </HoverStats>
  )
}

// archetypeSortValue is the value a row sorts by for the clicked column,
// build rate unless another column was clicked.
function archetypeSortValue(t, sortBy) {
  switch (sortBy) {
    case "type":
      return t.type
    case "win_percent":
      return t.win_percent
    case "bayes_win":
      return t.bayesian_win_percent
    case "shared":
      return t.avg_shared
    case "num":
      return t.count
    case "pwin":
      return t.percent_of_wins
    case "trophies":
      return t.trophies
    case "lastplace":
      return t.last_place
    case "winning":
      return t.winning
    case "losing":
      return t.losing
    case "winning_pct":
      if (t.count >= MinWinningPctDecks) {
        return t.winning / t.count
      }
      return -1
    case "avg_word_count":
      return t.avg_word_count
  }
  return t.build_percent
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
            <tr key={t.type} sort={archetypeSortValue(t, input.sortBy)} className="widget-table-row">
              {input.columns.map(column => column.cell(t, input))}
            </tr>
          )
        }).sort(SortFunc)
      }
    </tbody>
  );
}

export function ArchetypeStatsTable(input) {
  let archetypes = input.parsed.archetypeData
  let macroData = []
  let microData = []
  for (let arch of archetypes.values()) {
    if (arch.build_percent >= watermark) {
      if (macroArchetypes.has(arch.type)) {
        macroData.push(arch)
      } else {
        microData.push(arch)
      }
    }
  }

  const columns = visibleItems(ARCHETYPE_COLUMNS, input.info)

  // The tags table only shows when some tag is common enough to list.
  let tagsTable = null
  if (microData.length > 0) {
    tagsTable = (
      <>
        <h3 className="section-heading kit-section-title stats-section-gap-lg">{ARCHETYPES_COPY.statsTable.tagsHeading}</h3>
        <div className="table-scroll">
          <table className="widget-table">
            <ArchetypeTableHeader columns={columns} onHeaderClick={input.onHeaderClick} />
            <ArchetypeTableRows columns={columns} data={microData} sortBy={input.sortBy} handleRowClick={input.handleRowClick} />
          </table>
        </div>
      </>
    )
  }

  return (
    <div>
      <h3 className="section-heading kit-section-title">{ARCHETYPES_COPY.statsTable.archetypesHeading}</h3>
      <div className="table-scroll">
        <table className="widget-table">
          <ArchetypeTableHeader columns={columns} onHeaderClick={input.onHeaderClick} />
          <ArchetypeTableRows columns={columns} data={macroData} sortBy={input.sortBy} handleRowClick={input.handleRowClick} />
        </table>
      </div>
      {tagsTable}
    </div>
  );
}

// archetypeShare is the percent of an archetype's decks that played a card,
// or 0 when the archetype has no decks in the current range.
export function archetypeShare(count, archetype) {
  if (!archetype || !archetype.count) {
    return 0
  }
  return Math.round(count / archetype.count * 100)
}
