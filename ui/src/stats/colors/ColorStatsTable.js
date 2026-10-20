// The Colors stats table: its columns, how each cell draws, and how rows sort.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { asEvent } from "../../components/kit/controls.js"
import { Group, SegmentedControl } from "@mantine/core"
import { ColorImages, CUBE_AVG_WIN_PERCENT } from "../../utils/Colors.js"
import { MinWinningPctDecks, Pct, SortFunc } from "../../utils/Utils.js"
import { colorColumnShown, shownColorSort } from "./colorSort.js"

// colorIsDisplayed returns true if the given color identity should be displayed - e.g.,
// if Dual is selected, mono and trio colors are filtered out.
export function colorIsDisplayed(color, selection) {
  if (selection === "Dual" && color.length !== 2) {
    return false
  } else if (selection === "Mono" && color.length !== 1 ) {
    return false
  } else if (selection === "Trio" && color.length !== 3) {
    return false
  }
  return true
}

// COLOR_COLUMNS are the stats table's columns. Each one draws its own header
// and cell; needs lists the data a column is built from, and monoOnly marks a
// column that only makes sense for single colors.
const COLOR_COLUMNS = [
  {
    id: "color",
    text: "Color",
    tip: "The color or colors of the deck. If 'strict' is checked, the row includes data only from decks that are exactly this color. Otherwise, the row includes data from any decks that include this color/colors.",
    cell: (color) => <td key="color">{ColorImages(color.color)}</td>,
  },
  {
    id: "win",
    text: "Win %",
    tip: "Percentage of games played by this color/colors that were wins. Greyed when it can't be told apart from a coin flip at the chosen confidence; hover for the interval.",
    needs: ["results"],
    cell: (color) => <WinPercentCell key="win" color={color} />,
  },
  {
    id: "delta",
    text: "Δ vs avg",
    tip: "Win rate relative to the cube-wide average (50%). Positive (green) means this color wins more than its share of games; negative (red) means it loses more.",
    needs: ["results"],
    cell: (color) => <DeltaCell key="delta" color={color} />,
  },
  {
    id: "build",
    text: "Build %",
    tip: "Percentages of all built decks that include this color/colors.",
    cell: (color) => <td key="build">{color.build_percent.toFixed(0)}%</td>,
  },
  {
    id: "pwin",
    text: "% of wins",
    tip: "Share of wins among rows of this same identity length (mono, dual, tri). Sums to ~100% within each view.",
    needs: ["results"],
    cell: (color) => <td key="pwin">{color.percent_of_wins.toFixed(0)}%</td>,
  },
  {
    id: "vps",
    text: "Victory point %",
    tip: "Weighted win contribution of this color, as a percentage of total wins across all decks.",
    needs: ["results"],
    cell: (color, totals) => <td key="vps">{Pct(color.victory_points, totals.victoryPoints)}%</td>,
  },
  {
    id: "trophies",
    text: "Trophies",
    tip: "Number of 3-0 decks of this color.",
    needs: ["results"],
    cell: (color) => <td key="trophies">{color.trophies}</td>,
  },
  {
    id: "lastplace",
    text: "Last place",
    tip: "Number of 0-3 decks of this color.",
    needs: ["results"],
    cell: (color) => <td key="lastplace">{color.last_place}</td>,
  },
  {
    id: "winning",
    text: "Winning",
    tip: "Number of 2-1 or better.",
    needs: ["results"],
    cell: (color) => <td key="winning">{color.top_half}</td>,
  },
  {
    id: "losing",
    text: "Losing",
    tip: "Number of 1-2 or worse.",
    needs: ["results"],
    cell: (color) => <td key="losing">{color.bottom_half}</td>,
  },
  {
    id: "winning_pct",
    text: "Winning %",
    tip: "Percentage of decks with a 2-1 or better match record.",
    needs: ["results"],
    cell: (color) => <td key="winning_pct">{winningPercentText(color)}</td>,
  },
  {
    id: "decks",
    text: "# Decks",
    tip: "Number of decks in this row.",
    cell: (color) => <td key="decks">{color.num_decks}</td>,
  },
  {
    id: "picks",
    text: "Pick %",
    tip: "This color's share of all mainboarded cards across every deck. Sums to ~100% across rows.",
    monoOnly: true,
    cell: (color) => <td key="picks">{color.total_pick_percentage}%</td>,
  },
  {
    id: "splash",
    text: "Avg Deck Devotion",
    tip: "For each deck, the fraction of colored mana symbols matching this color identity, then averaged across decks. Each deck contributes equally regardless of size.",
    cell: (color) => <td key="splash">{color.average_deck_percentage}%</td>,
  },
  {
    id: "avg_word_count",
    text: "Avg Words",
    tip: "Average word count per non-land card in decks with this color, excluding reminder text.",
    cell: (color) => <td key="avg_word_count">{color.avg_word_count || 0}</td>,
  },
]

// shownColumns returns the stats table's columns for this cube and color type:
// columns needing data the cube lacks are dropped, as are single-color columns
// when pairs or trios are shown. Header and cells both come from this list.
function shownColumns(info, colorType) {
  return COLOR_COLUMNS.filter(column => colorColumnShown(column, info, colorType))
}

// winningPercentText is the share of decks with a winning record, or a dash
// for colors with too few decks to say.
function winningPercentText(color) {
  if (color.num_decks < MinWinningPctDecks) {
    return "—"
  }
  return Pct(color.top_half, color.num_decks) + "%"
}

// WinPercentCell shows a color's win rate, greyed when it can't be told apart
// from a coin flip, with the confidence interval on hover.
function WinPercentCell({ color }) {
  const hasCI = color.win_percent_low != null

  let style = undefined
  let title = undefined
  if (hasCI) {
    if (!color.significant) {
      style = { color: "var(--text-muted)" }
    }
    let verdict = "not distinguishable from 50%"
    if (color.significant) {
      verdict = "distinguishable from 50%"
    }
    title = `${color.win_percent_low.toFixed(0)}–${color.win_percent_high.toFixed(0)}% · ${verdict}`
  }

  return <td style={style} title={title}>{color.win_percent.toFixed(0)}%</td>
}

// DeltaCell shows a color's win rate above or below the cube average, signed
// and colored good or bad.
function DeltaCell({ color }) {
  const delta = color.win_percent - CUBE_AVG_WIN_PERCENT

  let className = "negative"
  let sign = ""
  if (delta >= 0) {
    className = "positive"
    sign = "+"
  }
  return <td className={className}>{sign + delta.toFixed(0) + "%"}</td>
}

// colorSortValue is the value a row sorts by for the chosen column, win rate
// unless another column was clicked.
function colorSortValue(color, sortBy) {
  if (sortBy === "delta") {
    return color.win_percent - CUBE_AVG_WIN_PERCENT
  } else if (sortBy === "build") {
    return color.build_percent
  } else if (sortBy === "decks") {
    return color.num_decks
  } else if (sortBy === "color") {
    return color.color
  } else if (sortBy === "picks") {
    return color.total_pick_percentage
  } else if (sortBy === "splash") {
    return color.average_deck_percentage
  } else if (sortBy === "pwin") {
    return color.percent_of_wins
  } else if (sortBy === "vps") {
    return color.victory_points
  } else if (sortBy === "trophies") {
    return color.trophies
  } else if (sortBy === "lastplace") {
    return color.last_place
  } else if (sortBy === "winning") {
    return color.top_half
  } else if (sortBy === "losing") {
    return color.bottom_half
  } else if (sortBy === "winning_pct") {
    if (color.num_decks >= MinWinningPctDecks) {
      return color.top_half / color.num_decks
    }
    return -1
  } else if (sortBy === "avg_word_count") {
    return color.avg_word_count || 0
  }
  return color.win_percent
}

// ColorStatsTable displays the win percentages and records by color.
export function ColorStatsTable(input) {
  if (input == null || input.colorData == null) {
    return null
  }

  // Iterate and calculate the actual win percentage for each.
  // Also, convert from a map to a list at this point so that we can
  // sort by win percentage.
  let colorData = Array.from(input.colorData.values())
  let buckets = input.parsed.colorDataBucketed
  if (input.parsed.colorDataBucketed.length > 0 && input.selectedBucket != "ALL") {
    for (let bucket of buckets) {
      if (bucket.name === input.selectedBucket) {
        // UI has selected a particualr bucket to investigate, so pull the data from that bucket only.
        let data = new Map(Object.entries(bucket.data))
        colorData = Array.from(data.values())
        break;
      }
    }
  }

  // Determine which rates to show, filtering out those which do not match the selected
  // color mode dropdown.
  let filtered = new Array();
  let totalVictoryPoints = 0;
  for (let d of colorData) {
    if (!colorIsDisplayed(d.color, input.colorTypeSelection)) {
      continue
    }

    // Inclue the color.
    filtered.push(d)

    // Track the total number of victory points within the selected colors, over the selected time frame.
    totalVictoryPoints += d.victory_points
  }

  const columns = shownColumns(input.info, input.colorTypeSelection)
  const sortBy = shownColorSort(input.sortBy, COLOR_COLUMNS, input.info, input.colorTypeSelection)
  const totals = { victoryPoints: totalVictoryPoints }

  return (
    <div className="stats-table-wrap">
      <table className="widget-table">
        <thead className="table-header">
          <tr key="header">
            {
              columns.map(function(hdr) {
                return (
                  <HoverInfo key={hdr.id} title={hdr.text} info={hdr.tip}>
                    <td onClick={input.onClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                  </HoverInfo>
                );
              })
            }
          </tr>
        </thead>
        <tbody>
          {
            filtered.map(function(color, idx) {
              return (
                <tr key={idx} sort={colorSortValue(color, sortBy)} className="widget-table-row">
                  {columns.map(column => column.cell(color, totals))}
                </tr>
              );
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

// TableHeader holds the stats table's controls: mono, pairs, or trios; which
// time bucket to look at; and how a deck's colors are counted.
export function TableHeader(input) {
  // Build selected bucket dropdown.
  let bucketNames = new Array();
  bucketNames.push({label: "ALL", value: "ALL"});
  for (let bucket of input.parsed.colorDataBucketed) {
    bucketNames.push(
      {
        label: bucket.name,
        value: bucket.name,
      },
    );
  }

  return (
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <SegmentedControl
        size="xs"
        aria-label="Color type"
        data={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={value => input.onSelected(asEvent(value))}
      />

      <DropdownHeader
        label="Bucket"
        className="dropdown"
        options={bucketNames}
        value={input.selectedBucket}
        onChange={input.onBucketSelected}
      />

      <DropdownHeader
        label="Color mode"
        className="dropdown"
        options={[
          { label: "Inclusive", value: "inclusive" },
          { label: "Exact", value: "exact" },
          { label: "Primary pair", value: "primary" },
        ]}
        value={input.colorMode}
        onChange={input.onColorModeChanged}
      />
    </Group>
  )
}
