import React, { useState, useEffect, useMemo } from 'react'
import { ActionIcon, Chip, Select, useComputedColorScheme } from "@mantine/core"
import { IconRefresh } from "@tabler/icons-react"
import { useCube } from "../contexts/CubeContext.js"
import { ChoiceHeader, DropdownHeader, NumericInput, Button } from "../components/Dropdown.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { HoverStats } from "../components/kit/HoverStats.js"
import { confidencePercent, winRateRows, winRateText, winRateValue } from "../components/kit/winRate.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { startLoad } from "../stats/loading.js"
import { pivotRequest } from "../stats/pageRequests.js"
import { pivotMeta } from "../stats/pivotMeta.js"
import { PRESETS, chartsCaption, sliceFromParams, writeSlice } from "../stats/chartsSlice.js"
import { useSearchParams } from "react-router-dom"
import { goodBadTint } from "../stats/tints.js"
import { useFilterSuggestions } from "../stats/useFilterSuggestions.js"
import { useDebouncedFilter } from "../hooks/useDebouncedFilter.js"
import { fetchJson } from "../utils/fetchJson.js"
import { availableValue, visibleItems } from "../utils/dataKinds.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import "../stats/stats.css"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"
import { PredicateBuilder } from "../components/PredicateBuilder.js"
import { bucketXScale } from "../utils/Buckets.js"
import { guildColor } from "../utils/Colors.js"

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { seriesColor, withAlpha } from "../theme/chartTheme.js"
import { colorName } from "../utils/colorNames.js"
import "./pages.css"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

// COPY holds the text this page adds around its charts. Placeholders for Casey
// to replace.
const COPY = {
  title: "Charts",
  slice: "Slice",
  refresh: "Refresh",
  settings: "Settings",
  winConfidence: "Win % confidence",
  filterPlaceholder: "Filter decks",

  dims: {
    color: "Color",
    archetype: "Archetype",
    label: "Tag",
    player: "Player",
    time: "Time",
    removal: "Removal count",
    interaction: "Interaction count",
    counterspell: "Counterspell count",
    creatures: "Creature count",
    lands: "Land count",
    avgCmc: "Avg mana value",
    dna: "DNA-tagged cards",
    none: "(none)",
    opponentColor: "Opponent color",
    opponentArchetype: "Opponent archetype",
    opponentRemoval: "Opponent removal count",
    opponentCreatures: "Opponent creature count",
    opponentAvgCmc: "Opponent avg mana value",
  },
  granularity: { any: "Any", mono: "Mono", dual: "Dual", trio: "Trio" },
  colorMode: { inclusive: "Inclusive", exact: "Exact", primary: "Primary" },
  metrics: { winPct: "Win %", record: "Record", games: "Games" },

  controls: {
    groupBy: "Group by",
    splitBy: "Split by",
    metric: "Metric",
    presets: "Start from",
    bucket: "Bucket",
    players: "Players",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    allIncluded: "all included - expand to exclude players and their games",
    excludedSummary: ({ excluded, kept }) => `${excluded} excluded (${kept} kept)`,
  },

  result: {
    empty: "No decks match this slice.",
    overall: "Overall",
  },

  pivotTable: {
    winPct: "Win %",
    record: "Record",
    decks: "Decks",
    winPctTip: "Share of games won by decks in this group, pulled toward 50% in proportion to how few games it has. Tinted only when it can be told apart from a coin flip at the chosen confidence. Hover for the raw win % and its interval.",
    recordTip: "Games won, lost and drawn by decks in this group.",
    decksTip: "Number of decks in this group.",
  },

  tooltip: {
    title: "Bayes win %",
    distinguishable: "distinguishable from 50%",
    notDistinguishable: "not distinguishable from 50%",
  },

  predicates: {
    dims: {
      color: "Color",
      archetype: "Archetype",
      label: "Tag",
      player: "Player",
      removal: "Removal count",
      interaction: "Interaction count",
      counterspell: "Counterspell count",
      creatures: "Creature count",
      lands: "Land count",
      avgCmc: "Avg mana value",
      dna: "DNA-tagged cards",
      cardQuery: "Card query",
    },
    ops: {
      contains: "contains",
      excludes: "excludes",
      is: "is",
      isNot: "is not",
      atLeast: "≥",
      atMost: "≤",
      equals: "=",
      matches: "matches",
    },
    removeFilter: "Remove filter",
    addFilter: "Add filter",
    noChoice: "—",
    queryPlaceholder: "e.g. o:flying t:creature",
    colorPlaceholder: "WUBRG",
  },
}

// The Explore view is a general deck-slicing pivot: group decks/games by a
// dimension, optionally split by a second, over a filtered subpopulation, and
// read a win-rate metric. Compute is server-side (POST /stats/pivot); this page
// only builds the request and renders the response.

// Dimensions usable for group-by. Color dims also expose granularity + mode.
// needs lists the data a dimension is read from: archetypes and tags need
// archetype labels, and opponent dimensions need match results.
const GROUP_DIMS = [
  { value: "color", label: COPY.dims.color, color: true },
  { value: "archetype", label: COPY.dims.archetype, needs: ["archetypes"] },
  { value: "label", label: COPY.dims.label, needs: ["archetypes"] },
  { value: "player", label: COPY.dims.player },
  { value: "time", label: COPY.dims.time },
  { value: "removal", label: COPY.dims.removal },
  { value: "interaction", label: COPY.dims.interaction },
  { value: "counterspell", label: COPY.dims.counterspell },
  { value: "creatures", label: COPY.dims.creatures },
  { value: "lands", label: COPY.dims.lands },
  { value: "avg_cmc", label: COPY.dims.avgCmc },
  { value: "dna", label: COPY.dims.dna },
]

const SPLIT_DIMS = [
  { value: "", label: COPY.dims.none },
  { value: "opponent_color", label: COPY.dims.opponentColor, color: true, needs: ["results"] },
  { value: "opponent_archetype", label: COPY.dims.opponentArchetype, needs: ["results", "archetypes"] },
  { value: "opponent_removal", label: COPY.dims.opponentRemoval, needs: ["results"] },
  { value: "opponent_creatures", label: COPY.dims.opponentCreatures, needs: ["results"] },
  { value: "opponent_avg_cmc", label: COPY.dims.opponentAvgCmc, needs: ["results"] },
  ...GROUP_DIMS,
]

const GRANULARITY_OPTS = [
  { value: 1, label: COPY.granularity.mono },
  { value: 2, label: COPY.granularity.dual },
  { value: 3, label: COPY.granularity.trio },
]

const COLOR_MODE_OPTS = [
  { value: "inclusive", label: COPY.colorMode.inclusive },
  { value: "exact", label: COPY.colorMode.exact },
  { value: "primary", label: COPY.colorMode.primary },
]

const METRIC_OPTS = [
  { value: "win_pct", label: COPY.metrics.winPct },
  { value: "record", label: COPY.metrics.record },
  { value: "games", label: COPY.metrics.games },
]

function isColorDim(dim) {
  return dim === "color" || dim === "opponent_color"
}

function keyLabel(dim, key) {
  if (key === "") return COPY.result.overall
  if (isColorDim(dim)) return colorName(key)
  return key
}

function cellGames(c) {
  return (c.wins || 0) + (c.losses || 0) + (c.draws || 0)
}

// absColor scales a win% from bad (0) through neutral (50) to good (100).
function absColor(winPct) {
  return goodBadTint((winPct - 50) / 50)
}

// winColor tints a win% cell red/green by its Bayes rate, but only when the
// raw rate is statistically distinguishable from 50%; otherwise it's the
// neutral gray. A small sample simply fails the significance check (which
// requires >=10 games), so it reads the same gray.
function winColor(c) {
  if (!c) return undefined
  if (cellGames(c) === 0 || !c.significant) return "var(--se-card)"
  return absColor(c.bayesian_win_percent)
}

// barColor tints a group's bar by its color identity (shared guildColor scheme).
// Non-color dimensions fall back to the first series color.
function barColor(dim, key) {
  if (isColorDim(dim) && key) return guildColor(key)
  return withAlpha(seriesColor(0), 0.7)
}

function metricText(metric, c) {
  if (!c) return ""
  if (metric === "record") return `${c.wins}-${c.losses}${c.draws ? "-" + c.draws : ""}`
  if (metric === "games") return `${cellGames(c)}`
  return cellGames(c) > 0 ? winRateText(c) : ""
}

// withWinStats wraps a pivot table cell in a popover with its raw win %,
// interval, record, games and significance verdict, kept out of the cell
// itself to avoid clutter. A cell with no games is returned as it is.
function withWinStats(c, confidence, cell, key) {
  const rows = winRateRows(c, confidencePercent(confidence))
  if (rows.length === 0) {
    return cell
  }
  let verdict = COPY.tooltip.notDistinguishable
  if (c.significant) {
    verdict = COPY.tooltip.distinguishable
  }
  return <HoverStats key={key} title={COPY.tooltip.title} rows={rows} footer={verdict}>{cell}</HoverStats>
}

// ExplorePage is the Charts page: the toolbar with its date range, deck filter,
// refresh, and confidence setting, then the slice controls and the pivot they
// produce.
export function ExplorePage(props) {
  const cubeID = useCube()
  const info = useCubeInfo(cubeID)

  // Reading the color scheme re-renders the page when it changes, so chart
  // colors computed while rendering follow light and dark mode.
  useComputedColorScheme("light")
  const [refresh, setRefresh] = useState(1)

  // The slice starts from the URL, so a shared or bookmarked link reopens it.
  const [params, setParams] = useSearchParams()
  const [initial] = useState(() => sliceFromParams(params))
  const [groupBy, setGroupBy] = useState(initial.groupBy)
  const [splitBy, setSplitBy] = useState(initial.splitBy)
  const [metric, setMetric] = useState(initial.metric)
  const [confidence, setConfidence] = useState("0.95")
  const [bucketSize, setBucketSize] = useState(initial.bucketSize)
  const [predicates, setPredicates] = useState(initial.predicates)

  const [result, setResult] = useState(null)
  // Players unchecked in the player filter - dropped from the aggregate entirely.
  const [excluded, setExcluded] = useState(new Set())
  const [playersOpen, setPlayersOpen] = useState(false)

  const start = props.startDate || ""
  const end = props.endDate || ""
  const filter = useDebouncedFilter(props.matchStr, props.onMatchUpdated)

  // The date range's unfiltered decks feed both the filter's autocomplete and
  // the player chips and predicate dropdowns below.
  const { decks, suggestions } = useFilterSuggestions(cubeID, start, end)
  const meta = useMemo(() => pivotMeta(decks), [decks])

  // A chosen dimension the cube can't fill falls back to one it can.
  const groupDim = availableValue(groupBy.dim, GROUP_DIMS, info)
  const splitDim = availableValue(splitBy.dim, SPLIT_DIMS, info, groupDim)
  const shownGroupBy = useMemo(() => ({ ...groupBy, dim: groupDim }), [groupBy, groupDim])
  const shownSplitBy = useMemo(() => ({ ...splitBy, dim: splitDim }), [splitBy, splitDim])
  const usesTime = groupDim === "time" || splitDim === "time"

  // Run the pivot whenever the query changes.
  useEffect(() => {
    const body = pivotRequest({
      start,
      end,
      groupBy: shownGroupBy,
      splitBy: shownSplitBy,
      bucketSize,
      usesTime,
      predicates,
      excluded,
      confidence,
      match: filter.settled,
    })
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }

    // Returning cancel drops an answer for an older query that arrives late.
    return startLoad(() => fetchJson(`/api/${cubeID}/stats/pivot`, options), setResult, () => setResult(null))
  }, [cubeID, start, end, shownGroupBy, shownSplitBy, bucketSize, predicates, refresh, usesTime, excluded, confidence, filter.settled])

  // Keep the URL in step with the slice, replacing the history entry so each
  // change doesn't add a back-button step.
  const slice = { groupBy: shownGroupBy, splitBy: shownSplitBy, metric, bucketSize, predicates }
  const sliceParams = writeSlice(params, slice).toString()
  useEffect(() => {
    if (sliceParams !== params.toString()) {
      setParams(new URLSearchParams(sliceParams), { replace: true })
    }
  }, [sliceParams])

  // applyPreset switches to one of the starting slices, keeping the filters.
  function applyPreset(preset) {
    setGroupBy(preset.slice.groupBy)
    setSplitBy(preset.slice.splitBy)
    setMetric(preset.slice.metric)
  }

  function togglePlayer(name) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const actions = (
    <>
      <ActionIcon variant="default" size="md" aria-label={COPY.refresh} onClick={() => setRefresh(r => r + 1)}>
        <IconRefresh size={16} />
      </ActionIcon>
      <SettingsPopover label={COPY.settings}>
        <Select
          size="xs"
          label={COPY.winConfidence}
          data={WIN_CONFIDENCE_OPTS}
          value={confidence}
          onChange={setConfidence}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
        />
      </SettingsPopover>
    </>
  )

  const controls = (
    <SectionCard title={COPY.slice}>
      <div className="explore-controls">
        <div className="explore-presets">
          <span className="explore-presets-label">{COPY.controls.presets}</span>
          {PRESETS.map(preset => (
            <Button key={preset.id} text={preset.label} onClick={() => applyPreset(preset)} />
          ))}
        </div>

        <div className="selector-group">
          <DropdownHeader label={COPY.controls.groupBy} value={groupDim} options={visibleItems(GROUP_DIMS, info)}
            onChange={(e) => setGroupBy({ ...groupBy, dim: e.target.value })} />
          {isColorDim(groupDim) && (
            <>
              <ChoiceHeader label="" value={groupBy.granularity} options={GRANULARITY_OPTS}
                onChange={(e) => setGroupBy({ ...groupBy, granularity: Number(e.target.value) })} />
              <ChoiceHeader label="" value={groupBy.color_mode} options={COLOR_MODE_OPTS}
                onChange={(e) => setGroupBy({ ...groupBy, color_mode: e.target.value })} />
            </>
          )}

          <DropdownHeader label={COPY.controls.splitBy} value={splitDim} options={visibleItems(SPLIT_DIMS, info)}
            onChange={(e) => setSplitBy({ ...splitBy, dim: e.target.value })} />
          {isColorDim(splitDim) && (
            <>
              <ChoiceHeader label="" value={splitBy.granularity} options={GRANULARITY_OPTS}
                onChange={(e) => setSplitBy({ ...splitBy, granularity: Number(e.target.value) })} />
              <ChoiceHeader label="" value={splitBy.color_mode} options={COLOR_MODE_OPTS}
                onChange={(e) => setSplitBy({ ...splitBy, color_mode: e.target.value })} />
            </>
          )}

          <ChoiceHeader label={COPY.controls.metric} value={metric} options={METRIC_OPTS}
            onChange={(e) => setMetric(e.target.value)} />

          {usesTime && (
            <NumericInput label={COPY.controls.bucket} value={bucketSize}
              onChange={(e) => setBucketSize(Math.max(1, Number(e.target.value)))} />
          )}
        </div>

        {meta.playerFreq.length > 0 && (
          <div className="player-filter">
            <div className="player-filter-head stats-clickable" onClick={() => setPlayersOpen(o => !o)}>
              <span className="caret">{playersOpen ? "▾" : "▸"}</span>
              <span className="section-heading">{COPY.controls.players}</span>
              <span className="player-filter-hint">
                {excluded.size > 0
                  ? COPY.controls.excludedSummary({ excluded: excluded.size, kept: meta.playerFreq.length - excluded.size })
                  : COPY.controls.allIncluded}
              </span>
            </div>
            {playersOpen && (
              <>
                <div className="selector-group page-row-gap">
                  <Button text={COPY.controls.selectAll} onClick={() => setExcluded(new Set())} />
                  <Button text={COPY.controls.deselectAll} onClick={() => setExcluded(new Set(meta.playerFreq.map(p => p.name)))} />
                </div>
                <div className="player-checkboxes">
                  {meta.playerFreq.map(p => (
                    <Chip key={p.name} size="xs" checked={!excluded.has(p.name)} onChange={() => togglePlayer(p.name)}>
                      {p.name} <span className="player-count">{p.count}</span>
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <PredicateBuilder predicates={predicates} onChange={setPredicates} meta={meta} copy={COPY.predicates} />

        <p className="explore-caption">{chartsCaption(slice)}</p>
      </div>
    </SectionCard>
  )

  return (
    <>
      <PageToolbar title={COPY.title} actions={actions}>
        <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} />
        <PillSearchInput
          placeholder={COPY.filterPlaceholder}
          value={filter.typed}
          onChange={event => filter.setTyped(event.target.value)}
          {...suggestions}
        />
      </PageToolbar>
      <div className="analyze-page explore-page">
        {controls}
        <ExploreResult result={result} groupBy={shownGroupBy} splitBy={shownSplitBy} metric={metric} usesTime={usesTime} confidence={confidence} />
      </div>
    </>
  )
}

function ExploreResult({ result, groupBy, splitBy, metric, usesTime, confidence }) {
  if (!result || !result.rows || result.rows.length === 0) {
    return <div className="browse-empty">{COPY.result.empty}</div>
  }
  if (usesTime) {
    return <PivotLineChart result={result} groupBy={groupBy} splitBy={splitBy} metric={metric} />
  }
  if (splitBy.dim) {
    return <PivotHeatmap result={result} groupBy={groupBy} splitBy={splitBy} metric={metric} confidence={confidence} />
  }
  return <PivotTable result={result} groupBy={groupBy} metric={metric} confidence={confidence} />
}

// PivotTable: one row per group, plus a win% bar chart.
function PivotTable({ result, groupBy, metric, confidence }) {
  const rows = result.rows
  const labels = rows.map(r => keyLabel(groupBy.dim, r.key))
  const data = rows.map(r => winRateValue(r.cells[""]) || 0)

  const barColors = rows.map(r => barColor(groupBy.dim, r.key))
  const chartData = {
    labels,
    datasets: [{
      label: COPY.pivotTable.winPct,
      data,
      backgroundColor: barColors,
      borderColor: barColors,
      borderWidth: 1,
    }],
  }
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { min: 0, max: 100 }, x: {} },
  }

  return (
    <div>
      <div className="stats-table-scroll">
        <table className="widget-table page-table-centered">
          <thead>
            <tr>
              <td className="header-cell">{groupLabel(groupBy.dim)}</td>
              <HoverInfo title={COPY.pivotTable.winPct} info={COPY.pivotTable.winPctTip}><td className="header-cell">{COPY.pivotTable.winPct}</td></HoverInfo>
              <HoverInfo title={COPY.pivotTable.record} info={COPY.pivotTable.recordTip}><td className="header-cell">{COPY.pivotTable.record}</td></HoverInfo>
              <HoverInfo title={COPY.pivotTable.decks} info={COPY.pivotTable.decksTip}><td className="header-cell">{COPY.pivotTable.decks}</td></HoverInfo>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const c = r.cells[""]
              return (
                <tr key={r.key} className="widget-table-row">
                  <td className="header-cell stats-bold">{keyLabel(groupBy.dim, r.key)}</td>
                  {withWinStats(c, confidence, (
                    <td style={{ textAlign: "center", background: winColor(c) }}>
                      {cellGames(c) > 0 ? winRateText(c) : "-"}
                    </td>
                  ))}
                  <td className="page-center-cell">{c.wins}-{c.losses}{c.draws ? `-${c.draws}` : ""}</td>
                  <td className="page-center-cell">{c.decks}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="explore-pivot-chart">
        <Bar options={options} data={chartData} />
      </div>
    </div>
  )
}

// PivotHeatmap: group rows × split columns, colored by win%.
function PivotHeatmap({ result, groupBy, splitBy, metric, confidence }) {
  const [sortColumn, setSortColumn] = React.useState(null)
  const cols = result.columns || [""]

  let rows = result.rows
  if (sortColumn !== null) {
    rows = [...rows].sort((a, b) => (winRateValue(b.cells[sortColumn]) ?? -1) - (winRateValue(a.cells[sortColumn]) ?? -1))
  }

  return (
    <div className="stats-table-scroll">
      <table className="widget-table stats-table-compact">
        <thead>
          <tr>
            <td className="header-cell explore-heatmap-row-head">{groupLabel(groupBy.dim)}</td>
            {cols.map(col => (
              <td key={col} className="header-cell"
                style={{
                  textAlign: "center", minWidth: "60px", cursor: "pointer",
                  background: sortColumn === col ? "var(--mantine-primary-color-filled)" : undefined,
                  color: sortColumn === col ? "var(--se-page)" : undefined,
                }}
                onClick={() => setSortColumn(sortColumn === col ? null : col)}>
                {keyLabel(splitBy.dim, col)}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="widget-table-row">
              <td className="header-cell stats-bold">{keyLabel(groupBy.dim, r.key)}</td>
              {cols.map(col => {
                const c = r.cells[col]
                return withWinStats(c, confidence, (
                  <td key={col}
                    style={{
                      textAlign: "center",
                      background: metric === "win_pct" && c ? winColor(c) : undefined,
                    }}>
                    {metricText(metric, c)}
                  </td>
                ), col)
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// PivotLineChart: whichever dimension is time becomes the x-axis; the other
// dimension becomes one line per key.
function PivotLineChart({ result, groupBy, splitBy, metric }) {
  const groupIsTime = groupBy.dim === "time"
  const seriesDim = groupIsTime ? splitBy.dim : groupBy.dim

  let xLabels, series
  if (groupIsTime) {
    // Rows are time buckets; columns are series.
    xLabels = result.rows.map(r => r.key)
    const cols = result.columns || [""]
    series = cols.map(col => ({
      key: col,
      points: result.rows.map(r => metricValue(metric, r.cells[col])),
    }))
  } else {
    // Columns are time buckets; rows are series.
    xLabels = (result.columns || [""]).filter(c => c !== "")
    if (xLabels.length === 0) xLabels = result.columns || [""]
    series = result.rows.map(r => ({
      key: r.key,
      points: xLabels.map(col => metricValue(metric, r.cells[col])),
    }))
  }

  const datasets = series.map((s, i) => ({
    label: keyLabel(seriesDim, s.key),
    data: s.points,
    borderColor: seriesColor(i),
    backgroundColor: seriesColor(i),
    spanGaps: true,
  }))

  const yMax = metric === "win_pct" ? 100 : undefined
  const options = {
    responsive: true, maintainAspectRatio: false,

    scales: {
      x: bucketXScale,
      y: { min: 0, max: yMax },
    },
  }

  return (
    <div className="explore-line-chart">
      <Line options={options} data={{ labels: xLabels, datasets }} />
    </div>
  )
}

function metricValue(metric, c) {
  if (!c) return null
  if (metric === "games") return cellGames(c)
  return winRateValue(c) // record falls back to Bayes win% for a numeric line
}

function groupLabel(dim) {
  const d = GROUP_DIMS.find(x => x.value === dim) || SPLIT_DIMS.find(x => x.value === dim)
  return d ? d.label : dim
}
