// The Colors stats table: its columns, how each cell draws, and how rows sort.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { WinRateCell } from "../../components/kit/WinRateCell.js"
import { asEvent } from "../../components/kit/controls.js"
import { Group, SegmentedControl } from "@mantine/core"
import { ColorImages } from "../../utils/Colors.js"
import { colorName } from "../../utils/colorNames.js"
import { SortFunc } from "../../utils/Utils.js"
import { colorColumnShown, shownColorSort } from "./colorSort.js"
import { OpenInCharts, colorSide } from "../OpenInCharts.js"
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
    cell: (color) => <ColorCell key="color" color={color} />,
  },
  {
    id: "build",
    text: COLORS_COPY.statsTable.buildPct.text,
    tip: COLORS_COPY.statsTable.buildPct.tip,
    cell: (color) => <td key="build">{color.build_percent.toFixed(0)}%</td>,
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
    id: "bayes_win",
    text: COLORS_COPY.statsTable.bayesWinPct.text,
    tip: COLORS_COPY.statsTable.bayesWinPct.tip,
    needs: ["results"],
    cell: (color, input) => <WinRateCell key="bayes_win" record={color} confidence={input.confidence} alwaysMuted />,
  },
]

// shownColumns returns the stats table's columns for this cube and color type:
// columns needing data the cube lacks are dropped, as are single-color columns
// when pairs or trios are shown. Header and cells both come from this list.
function shownColumns(info, colorType) {
  return COLOR_COLUMNS.filter(column => colorColumnShown(column, info, colorType))
}

// ColorCell shows a row's color pips, with the guild or shard name in small
// text beside a multi-color group.
function ColorCell({ color }) {
  const name = colorName(color.color)
  let label = null
  if (color.color.length > 1 && name !== color.color) {
    label = <span className="stats-muted-small colors-group-name">{name}</span>
  }
  return (
    <td className="stats-narrow-cell">
      <span className="colors-group-cell">{ColorImages(color.color)}{label}</span>
    </td>
  )
}

// colorSortValue is the value a row sorts by for the chosen column, Build %
// unless another column was clicked.
function colorSortValue(color, sortBy) {
  if (sortBy === "decks") {
    return color.num_decks
  } else if (sortBy === "color") {
    return color.color
  } else if (sortBy === "picks") {
    return color.total_pick_percentage
  } else if (sortBy === "bayes_win") {
    return color.bayesian_win_percent
  }
  return color.build_percent
}

// ColorStatsTable displays how often each color is built and played, with
// its win rate greyed as unreliable.
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
  for (let d of colorData) {
    if (!colorIsDisplayed(d.color, input.colorTypeSelection)) {
      continue
    }

    // Inclue the color.
    filtered.push(d)
  }

  const columns = shownColumns(input.info, input.colorTypeSelection)
  const sortBy = shownColorSort(input.sortBy, COLOR_COLUMNS, input.info, input.colorTypeSelection)

  return (
    <div className="stats-table-wrap">
      <table className="widget-table">
        <thead className="table-header">
          <tr key="header">
            {
              columns.map(function(hdr) {
                return (
                  <HoverInfo key={hdr.id} title={hdr.text} info={hdr.tip}>
                    <td onClick={input.onClick} id={hdr.id} className="header-cell stats-narrow-cell">{hdr.text}</td>
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
                  {columns.map(column => column.cell(color, input))}
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
      <OpenInCharts slice={{ groupBy: colorSide("color", input.colorTypeSelection, input.colorMode) }} />

      <SegmentedControl
        size="xs"
        aria-label={COLORS_COPY.statsTable.colorTypeLabel}
        data={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={value => input.onSelected(asEvent(value))}
      />

      <DropdownHeader
        label={COLORS_COPY.statsTable.bucketLabel}
        options={bucketNames}
        value={input.selectedBucket}
        onChange={input.onBucketSelected}
      />

      <DropdownHeader
        label={COLORS_COPY.statsTable.colorModeLabel}
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
