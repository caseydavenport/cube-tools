// The Colors stats table: its columns, how each cell draws, and how rows sort.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { HoverStats } from "../../components/kit/HoverStats.js"
import { asEvent } from "../../components/kit/controls.js"
import { Group, SegmentedControl } from "@mantine/core"
import { ColorImages, CUBE_AVG_WIN_PERCENT } from "../../utils/Colors.js"
import { MinWinningPctDecks, Pct, SortFunc } from "../../utils/Utils.js"
import { colorColumnShown, shownColorSort } from "./colorSort.js"
import { COLORS_COPY } from "./copy.js"

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
    text: COLORS_COPY.statsTable.color.text,
    tip: COLORS_COPY.statsTable.color.tip,
    cell: (color) => <td key="color">{ColorImages(color.color)}</td>,
  },
  {
    id: "win",
    text: COLORS_COPY.statsTable.winPct.text,
    tip: COLORS_COPY.statsTable.winPct.tip,
    needs: ["results"],
    cell: (color) => <WinPercentCell key="win" color={color} />,
  },
  {
    id: "delta",
    text: COLORS_COPY.statsTable.delta.text,
    tip: COLORS_COPY.statsTable.delta.tip,
    needs: ["results"],
    cell: (color) => <DeltaCell key="delta" color={color} />,
  },
  {
    id: "build",
    text: COLORS_COPY.statsTable.buildPct.text,
    tip: COLORS_COPY.statsTable.buildPct.tip,
    cell: (color) => <td key="build">{color.build_percent.toFixed(0)}%</td>,
  },
  {
    id: "pwin",
    text: COLORS_COPY.statsTable.percentOfWins.text,
    tip: COLORS_COPY.statsTable.percentOfWins.tip,
    needs: ["results"],
    cell: (color) => <td key="pwin">{color.percent_of_wins.toFixed(0)}%</td>,
  },
  {
    id: "vps",
    text: COLORS_COPY.statsTable.victoryPointPct.text,
    tip: COLORS_COPY.statsTable.victoryPointPct.tip,
    needs: ["results"],
    cell: (color, totals) => <td key="vps">{Pct(color.victory_points, totals.victoryPoints)}%</td>,
  },
  {
    id: "trophies",
    text: COLORS_COPY.statsTable.trophies.text,
    tip: COLORS_COPY.statsTable.trophies.tip,
    needs: ["results"],
    cell: (color) => <td key="trophies">{color.trophies}</td>,
  },
  {
    id: "lastplace",
    text: COLORS_COPY.statsTable.lastPlace.text,
    tip: COLORS_COPY.statsTable.lastPlace.tip,
    needs: ["results"],
    cell: (color) => <td key="lastplace">{color.last_place}</td>,
  },
  {
    id: "winning",
    text: COLORS_COPY.statsTable.winning.text,
    tip: COLORS_COPY.statsTable.winning.tip,
    needs: ["results"],
    cell: (color) => <td key="winning">{color.top_half}</td>,
  },
  {
    id: "losing",
    text: COLORS_COPY.statsTable.losing.text,
    tip: COLORS_COPY.statsTable.losing.tip,
    needs: ["results"],
    cell: (color) => <td key="losing">{color.bottom_half}</td>,
  },
  {
    id: "winning_pct",
    text: COLORS_COPY.statsTable.winningPct.text,
    tip: COLORS_COPY.statsTable.winningPct.tip,
    needs: ["results"],
    cell: (color) => <td key="winning_pct">{winningPercentText(color)}</td>,
  },
  {
    id: "decks",
    text: COLORS_COPY.statsTable.decks.text,
    tip: COLORS_COPY.statsTable.decks.tip,
    cell: (color) => <td key="decks">{color.num_decks}</td>,
  },
  {
    id: "picks",
    text: COLORS_COPY.statsTable.pickPct.text,
    tip: COLORS_COPY.statsTable.pickPct.tip,
    monoOnly: true,
    cell: (color) => <td key="picks">{color.total_pick_percentage}%</td>,
  },
  {
    id: "splash",
    text: COLORS_COPY.statsTable.devotion.text,
    tip: COLORS_COPY.statsTable.devotion.tip,
    cell: (color) => <td key="splash">{color.average_deck_percentage}%</td>,
  },
  {
    id: "avg_word_count",
    text: COLORS_COPY.statsTable.avgWords.text,
    tip: COLORS_COPY.statsTable.avgWords.tip,
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
  if (color.win_percent_low == null) {
    return <td>{color.win_percent.toFixed(0)}%</td>
  }

  let style = undefined
  let verdict = COLORS_COPY.statsTable.distinguishable
  if (!color.significant) {
    style = { color: "var(--se-muted)" }
    verdict = COLORS_COPY.statsTable.notDistinguishable
  }
  const rows = [{
    label: COLORS_COPY.statsTable.winIntervalLabel,
    value: COLORS_COPY.statsTable.winInterval({
      low: color.win_percent_low.toFixed(0),
      high: color.win_percent_high.toFixed(0),
    }),
  }]

  return (
    <HoverStats rows={rows} footer={verdict}>
      <td style={style}>{color.win_percent.toFixed(0)}%</td>
    </HoverStats>
  )
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
  bucketNames.push({
    label: COLORS_COPY.statsTable.allBuckets,
    // copy-ok: the value Stats.js and the table compare selectedBucket against
    value: "ALL",
  });
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
        aria-label={COLORS_COPY.statsTable.colorTypeLabel}
        data={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={value => input.onSelected(asEvent(value))}
      />

      <DropdownHeader
        label={COLORS_COPY.statsTable.bucketLabel}
        className="dropdown"
        options={bucketNames}
        value={input.selectedBucket}
        onChange={input.onBucketSelected}
      />

      <DropdownHeader
        label={COLORS_COPY.statsTable.colorModeLabel}
        className="dropdown"
        options={[
          { label: COLORS_COPY.statsTable.modeInclusive, value: "inclusive" },
          { label: COLORS_COPY.statsTable.modeExact, value: "exact" },
          { label: COLORS_COPY.statsTable.modePrimary, value: "primary" },
        ]}
        value={input.colorMode}
        onChange={input.onColorModeChanged}
      />
    </Group>
  )
}
