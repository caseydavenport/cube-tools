// The Archetypes stats table: its columns, how each cell draws, and how rows sort.

import React from 'react'
import { MinWinningPctDecks, Pct, SortFunc } from "../../utils/Utils.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { visibleItems } from "../../utils/dataKinds.js"
import { macroArchetypes, watermark } from "./archetypeHelpers.js"

// ARCHETYPE_COLUMNS are the archetype and tag tables' columns. Each draws its
// own header and cell; needs lists the data a column is built from, so cubes
// without match results show no win columns.
const ARCHETYPE_COLUMNS = [
  {
    id: "type",
    text: "Tag",
    tip: "Archetype (aggro / midrange / control) or tag applied to a deck. A deck may have multiple tags",
    cell: (t, input) => <td id={t.type} onClick={input.handleRowClick} key="type">{t.type}</td>,
  },
  {
    id: "build_percent",
    text: "Build %",
    tip: "Percentage of all built decks that have this archetype / tag.",
    cell: (t) => <td key="build_percent">{t.build_percent.toFixed(0)}%</td>,
  },
  {
    id: "win_percent",
    text: "Win %",
    tip: "Win percentage of decks that have this archetype / tag. Greyed when it can't be told apart from a coin flip at the chosen confidence; hover for the interval.",
    needs: ["results"],
    cell: (t) => <ArchetypeWinCell key="win_percent" stats={t} />,
  },
  {
    id: "pwin",
    text: "% of wins",
    tip: "Number of wins from decks with this tag, divided by the total number of wins across all decks.",
    needs: ["results"],
    cell: (t) => <td key="pwin">{t.percent_of_wins.toFixed(0)}%</td>,
  },
  {
    id: "trophies",
    text: "Trophies",
    tip: "Number of 3-0 decks of this archetype / tag.",
    needs: ["results"],
    cell: (t) => <td key="trophies">{t.trophies}</td>,
  },
  {
    id: "lastplace",
    text: "Last place",
    tip: "Number of 0-3 decks of this archetype / tag.",
    needs: ["results"],
    cell: (t) => <td key="lastplace">{t.last_place}</td>,
  },
  {
    id: "winning",
    text: "Winning",
    tip: "Number of 2-1 or better.",
    needs: ["results"],
    cell: (t) => <td key="winning">{t.winning}</td>,
  },
  {
    id: "losing",
    text: "Losing",
    tip: "Number of 1-2 or worse.",
    needs: ["results"],
    cell: (t) => <td key="losing">{t.losing}</td>,
  },
  {
    id: "winning_pct",
    text: "Winning %",
    tip: "Percentage of decks with a 2-1 or better match record.",
    needs: ["results"],
    cell: (t) => <td key="winning_pct">{winningPercentText(t)}</td>,
  },
  {
    id: "num",
    text: "# Decks",
    tip: "Total number of decks with this archetype / tag.",
    cell: (t) => <td key="num">{t.count}</td>,
  },
  {
    id: "shared",
    text: "Avg other types",
    tip: "Average number of other tags applied to decks with this archetype / tag.",
    cell: (t) => <td key="shared">{t.avg_shared}</td>,
  },
  {
    id: "avg_word_count",
    text: "Avg Words",
    tip: "Average word count per non-land card in decks with this archetype, excluding reminder text.",
    cell: (t) => <td key="avg_word_count">{t.avg_word_count}</td>,
  },
];

// winningPercentText is the share of decks with a winning record, or a dash
// when there are too few decks to say.
function winningPercentText(t) {
  if (t.count < MinWinningPctDecks) {
    return "—"
  }
  return Pct(t.winning, t.count) + "%"
}

// ArchetypeWinCell shows a win rate, greyed when it can't be told apart from a
// coin flip, with the confidence interval on hover.
function ArchetypeWinCell({ stats }) {
  let style = undefined
  let title = undefined
  if (stats.win_percent_low != null) {
    if (!stats.significant) {
      style = { color: "var(--text-muted)" }
    }
    let verdict = "not distinguishable from 50%"
    if (stats.significant) {
      verdict = "distinguishable from 50%"
    }
    title = `${stats.win_percent_low.toFixed(0)}–${stats.win_percent_high.toFixed(0)}% · ${verdict}`
  }
  return <td style={style} title={title}>{stats.win_percent.toFixed(0)}%</td>
}

// archetypeSortValue is the value a row sorts by for the clicked column,
// build rate unless another column was clicked.
function archetypeSortValue(t, sortBy) {
  switch (sortBy) {
    case "type":
      return t.type
    case "win_percent":
      return t.win_percent
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
        <h3 className="section-heading kit-section-title" style={{marginTop: "1.5rem"}}>Tags</h3>
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
      <h3 className="section-heading kit-section-title">Archetypes</h3>
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
