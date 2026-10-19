import React from 'react'
import { IsBasicLand, MinWinningPctDecks, Pct, SortFunc } from "../utils/Utils.js"
import { Trophies, LastPlaceFinishes, Winning, Losing, Wins, Losses } from "../utils/Deck.js"
import { DropdownHeader, NumericInput, Checkbox } from "../components/Dropdown.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { availableValue, visibleItems } from "../utils/dataKinds.js"
import { Section, SectionNav } from "../components/PageSections.js"
import { BucketName, bucketXScale } from "../utils/Buckets.js"
import { ColorImages, CUBE_AVG_WIN_PERCENT } from "../utils/Colors.js"
import { winInterval } from "../utils/Stats.js"


import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { personLabel } from "../utils/Players.js"
import { currentChartTheme, deltaFill, seriesColor, withAlpha, zeroLineGrid } from "../theme/chartTheme.js"

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

// The mark an archetype must hit to be included in this page.
// Set a default here that roughly maps to once every 4 drafts.
const watermark = 100 * 1 / 32


// CHART_OPTIONS are the Trends charts. needs lists the data each is built
// from, so a cube without match results doesn't offer the win charts.
const CHART_OPTIONS = [
  { label: "Archetype Δ vs avg", value: "macro_delta", needs: ["results"] },
  { label: "Archetype Build %", value: "macro_builds" },
  { label: "Archetype Win %", value: "macro_wins", needs: ["results"] },
  { label: "Archetype % of wins", value: "macro_pwin", needs: ["results"] },
  { label: "Archetype Winning %", value: "macro_winning_pct", needs: ["results"] },
  { label: "Archetype Trophy %", value: "macro_trophy_pct", needs: ["results"] },
  { label: "Archetype Last Place %", value: "macro_lastplace_pct", needs: ["results"] },
  { label: "Archetype CMC", value: "macro_cmc" },
  { label: "Matchup: Aggro", value: "matchup_aggro", needs: ["results"] },
  { label: "Matchup: Midrange", value: "matchup_midrange", needs: ["results"] },
  { label: "Matchup: Control", value: "matchup_control", needs: ["results"] },
  { label: "Pie: Builds", value: "pie_builds" },
  { label: "Pie: Wins", value: "pie_wins", needs: ["results"] },
  { label: "Tag Build %", value: "micro_builds" },
  { label: "Tag Win %", value: "micro_wins", needs: ["results"] },
  { label: "Tag Winning %", value: "micro_winning_pct", needs: ["results"] },
  { label: "Tag Trophy %", value: "micro_trophy_pct", needs: ["results"] },
  { label: "Tag Last Place %", value: "micro_lastplace_pct", needs: ["results"] },
  { label: "Tag % of wins", value: "micro_pwin", needs: ["results"] },
]

const ARCH_SECTIONS = [
  { id: "archetypes", label: "Archetypes" },
  { id: "selected-archetype", label: "Selected Archetype" },
  { id: "trends", label: "Trends" },
]

export function ArchetypeWidget(input) {
  const [leftChart, setLeftChart] = React.useState("macro_builds")
  const [rightChart, setRightChart] = React.useState("macro_wins")

  if (!input.show) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const chartOptions = visibleItems(CHART_OPTIONS, input.info)
  const left = availableValue(leftChart, CHART_OPTIONS, input.info)
  const right = availableValue(rightChart, CHART_OPTIONS, input.info)

  const renderChart = (chartId) => {
    switch (chartId) {
      case "macro_delta": return <MacroArchetypeDeltaChart parsed={input.parsed} />;
      case "macro_builds": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="builds" />;
      case "macro_wins": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="wins" />;
      case "macro_pwin": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="percent_of_wins" />;
      case "macro_winning_pct": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="winning_pct" />;
      case "macro_trophy_pct": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="trophy_pct" />;
      case "macro_lastplace_pct": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="lastplace_pct" />;
      case "macro_cmc": return <MacroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="cmc" />;
      case "matchup_aggro": return <WinsByMatchup focus="aggro" matchups={input.matchups} />;
      case "matchup_midrange": return <WinsByMatchup focus="midrange" matchups={input.matchups} />;
      case "matchup_control": return <WinsByMatchup focus="control" matchups={input.matchups} />;
      case "pie_builds": return <MacroArchetypesPieChart parsed={input.parsed} decks={input.decks} dataset="builds" />;
      case "pie_wins": return <MacroArchetypesPieChart parsed={input.parsed} decks={input.decks} dataset="wins" />;
      case "micro_builds": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="builds" />;
      case "micro_wins": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="wins" />;
      case "micro_winning_pct": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="winning_pct" />;
      case "micro_trophy_pct": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="trophy_pct" />;
      case "micro_lastplace_pct": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="lastplace_pct" />;
      case "micro_pwin": return <MicroArchetypesChart parsed={input.parsed} decks={input.decks} bucketSize={input.bucketSize} dataset="percent_of_wins" />;
      default: return null;
    }
  }

  return (
    <div className="analyze-page">
      <SectionNav sections={ARCH_SECTIONS} />

      <div className="controls-panel">
        <span className="section-heading">Colors</span>
        <ColorPickerHeader display={input.colorCheckboxes} onChecked={input.onColorChecked} />
      </div>

      <Section id="archetypes">
        <ArchetypeStatsTable
          parsed={input.parsed}
          decks={input.decks}
          dropdownSelection={input.colorTypeSelection}
          sortBy={input.sortBy}
          onHeaderClick={input.onHeaderClick}
          handleRowClick={input.handleRowClick}
          selectedArchetype={input.selectedArchetype}
          info={input.info}
        />
      </Section>

      <Section id="selected-archetype" heading={`Selected — ${input.selectedArchetype}`}>
        <TopCardsInArchetypeWidget
          parsed={input.parsed}
          cardData={input.cardData}
          decks={input.decks}
          minDrafts={input.minDrafts}
          cube={input.cube}
          minDecksInArch={input.minDecksInArch}
          archetypeDropdownOptions={input.archetypeDropdownOptions}
          selectedArchetype={input.selectedArchetype}
          onArchetypeSelected={input.onArchetypeSelected}
          colorWidgetOpts={input.colorWidgetOpts}
          onColorSelected={input.onColorSelected}
          colorSelection={input.colorSelection}
          onMinDraftsSelected={input.onMinDraftsSelected}
          onMinGamesSelected={input.onMinGamesSelected}
        />
        <ArchetypeDetailsPanel
          parsed={input.parsed}
          decks={input.decks}
          selectedArchetype={input.selectedArchetype}
        />
      </Section>

      <Section id="trends" heading="Trends">
        <div className="controls-panel">
          <div className="selector-group" style={{"justifyContent": "center"}}>
            <DropdownHeader
              label="Left Chart"
              options={chartOptions}
              value={left}
              onChange={(e) => setLeftChart(e.target.value)}
            />
            <DropdownHeader
              label="Right Chart"
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
      </Section>
    </div>
  );
}

const macroArchetypes = new Set(["aggro", "midrange", "control"]);

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

function ArchetypeStatsTable(input) {
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
function archetypeShare(count, archetype) {
  if (!archetype || !archetype.count) {
    return 0
  }
  return Math.round(count / archetype.count * 100)
}

export function ColorPickerHeader(input) {
  return (
    <div className="selector-group" style={{"padding": "0.5rem", "justifyContent": "center"}}>
      <Checkbox
        text={ColorImages("W")}
        id="W"
        checked={input.display[0]}
        onChange={input.onChecked}
      />
      <Checkbox
        text={ColorImages("U")}
        id="U"
        checked={input.display[1]}
        onChange={input.onChecked}
      />
      <Checkbox
        text={ColorImages("B")}
        id="B"
        checked={input.display[2]}
        onChange={input.onChecked}
      />
      <Checkbox
        text={ColorImages("R")}
        id="R"
        checked={input.display[3]}
        onChange={input.onChecked}
      />
      <Checkbox
        text={ColorImages("G")}
        id="G"
        checked={input.display[4]}
        onChange={input.onChecked}
      />
    </div>
  );
}

function TopCardsInArchetypeWidgetOptions(input) {
  return (
    <div className="selector-group">
      <DropdownHeader
        label="Archetype"
        options={input.archetypeDropdownOptions}
        value={input.selectedArchetype}
        onChange={input.onArchetypeSelected}
      />

      <DropdownHeader
        label="Color"
        options={input.colorWidgetOpts}
        value={input.colorSelection}
        onChange={input.onColorSelected}
      />

      <NumericInput
        label="Min picks"
        value={input.minDrafts}
        onChange={input.onMinDraftsSelected}
      />

      <NumericInput
        label="Decks in arch"
        value={input.minDecksInArch}
        onChange={input.onMinGamesSelected}
      />
    </div>
  );
}

function TopCardsInArchetypeWidget(input) {
  const [sortBy, setSortBy] = React.useState("decks");
  const [invertSort, setInvertSort] = React.useState(false);

  const onSort = (id) => {
    if (sortBy === id) {
      setInvertSort(!invertSort);
    } else {
      setSortBy(id);
      setInvertSort(false);
    }
  };

  // Get all cards that are currently active.
  let data = input.cardData
  let archetypes = input.parsed.archetypeData

  // Filter out cards that don't match the given archetype, or don't meet minimum
  // requirements.
  let filtered = new Array()
  data.forEach(function(card, name) {
    // Convert the card.archetypes object to a map for easier access.
    let cardArch = new Map()
    for (let [arch, count] of Object.entries(card.archetypes)) {
      cardArch.set(arch, count)
    }
    if (!cardArch.has(input.selectedArchetype)) {
      return
    }
    if (cardArch.get(input.selectedArchetype) < input.minDecksInArch) {
      return
    }
    filtered.push(card)
  })

  let headers = [
    {
      id: "card",
      text: "Card",
      tip: "The card's name."
    },
    {
      id: "focal",
      text: "Focal Score",
      tip: "Combines include rate and correlation to identify cards that define the archetype. High scores indicate cards that are both common in this archetype and rarely seen outside of it.",
    },
    {
      id: "decks",
      text: "# Decks",
      tip: "Number of times this card has been mainboarded in decks with the selected archetype / tag.",
    },
    {
      id: "include_rate",
      text: "Include rate",
      tip: "Percentage of decks in the selected archetype / tag that include this card.",
    },
    {
      id: "correlation",
      text: "Correlation",
      tip: "How correlated this card is with the selected archetype / tag. Percentage of decks that this card has been mainboarded in that have the selected archetype / tag.",
    },
  ]

  return (
    <div>
      <div className="controls-panel">
        <TopCardsInArchetypeWidgetOptions {...input} />
      </div>
      <h3 className="section-heading">Top Cards in Archetype</h3>
      <div className="table-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            {
              headers.map(function(hdr, i) {
                return (
                  <HoverInfo key={i} title={hdr.text} info={hdr.tip}>
                    <td id={hdr.id} onClick={() => onSort(hdr.id)} className="header-cell">{hdr.text}</td>
                  </HoverInfo>
                );
              })
            }
          </tr>
        </thead>
        <tbody>
          {
            filtered.map(function(card) {
              // Convert the card.archetypes object to a map for easier access.
              let cardArch = new Map()
              for (let [arch, count] of Object.entries(card.archetypes)) {
                cardArch.set(arch, count)
              }

              let count = cardArch.get(input.selectedArchetype)
              let percentage = archetypeShare(count, archetypes.get(input.selectedArchetype))
              let correlation = Math.round(count / card.mainboard * 100)
              let focal = Math.round((percentage / 100) * (correlation / 100) * 100)

              let sort = count;
              switch (sortBy) {
                case "card": sort = card.name; break;
                case "decks": sort = count; break;
                case "include_rate": sort = percentage; break;
                case "correlation": sort = correlation; break;
                case "focal": sort = focal; break;
              }

              if (invertSort) {
                if (typeof sort === "number") sort = -sort;
                else sort = sort.toString().split("").reverse().join(""); // Crude string invert
              }

              return (
                <tr sort={sort} className="widget-table-row" key={card.name}>
                  <td ><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td >{focal}</td>
                  <td >{count}</td>
                  <td >{percentage}%</td>
                  <td >{correlation}%</td>
                </tr>
            )}).sort(SortFunc)
          }
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ArchetypeDetailsPanel(input) {
  // Get the archetype data for the selected archetype.
  let archetypeData = input.parsed.archetypeData
  let sharedData = []
  let playerData = []
  let arch = archetypeData.get(input.selectedArchetype)
  if (arch != null) {
    arch.shared_with.forEach(function(num, name) {
      sharedData.push({"name": name, "num": num})
    })
    arch.players.forEach(function(num, name) {
      playerData.push({"name": name, "num": num})
    })
  }
  return (
    <div className="detail-grid">
      <div>
        <h3 className="section-heading">Paired With</h3>
        <div className="table-scroll">
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onHeaderClick} id="name" className="header-cell">Archetype</td>
              <td onClick={input.onHeaderClick} id="num" className="header-cell">#</td>
            </tr>
          </thead>
          <tbody>
            {
              sharedData.map(function(arch) {
                return (
                  <tr key={arch.name} sort={arch.num} className="widget-table-row">
                    <td key="name">{arch.name}</td>
                    <td key="num">{arch.num}</td>
                  </tr>
                )
              }).sort(SortFunc)
            }
          </tbody>
        </table>
        </div>
      </div>

      <div>
        <h3 className="section-heading">Played By</h3>
        <div className="table-scroll">
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onHeaderClick} id="name" className="header-cell">Player</td>
              <td onClick={input.onHeaderClick} id="num" className="header-cell">#</td>
            </tr>
          </thead>
          <tbody>
            {
              playerData.map(function(player) {
                return (
                  <tr key={player.name} sort={player.num} className="widget-table-row">
                    <td key="name">{player.name}</td>
                    <td key="num">{player.num}</td>
                  </tr>
                )
              }).sort(SortFunc)
            }
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export function ArchetypeData(decks, confidence) {
  let newType = function(type) {
    return {
      type: type,
      count: 0,
      wins: 0,
      losses: 0,
      shared_with: new Map(),
      num_shared_with: 0,
      players: new Map(),
      build_percent: 0,
      win_percent: 0,
      avg_shared: 0,
      avg_cmc: 0,
      avg_word_count: 0,
      num_wc_decks: 0,
      num_cmc_decks: 0,
      trophies: 0,
      last_place: 0,
      winning: 0,
      losing: 0,
    }
  }

  // First, determine the popularity of each archetype by iterating all decks
  // and counting the instances of each.
  let totalGames = 0
  let tracker = new Map()

  // We set aggro/midrange/control for every set of decks, even if they are
  // zeroed out. This enables graphs that expect these to exist.
  tracker.set("aggro", newType("aggro"))
  tracker.set("midrange", newType("midrange"))
  tracker.set("control", newType("control"))

  for (let deck of decks) {
    // We only need to count wins, because every loss is counted in another deck as a win.
    totalGames += Wins(deck)

    let types = deck.labels.slice()
    if (deck.macro_archetype) types.push(deck.macro_archetype)
    for (let type of types) {
      if (!tracker.has(type)) {
        tracker.set(type, newType(type))
      }
      tracker.get(type).count += 1
      tracker.get(type).wins += Wins(deck)
      tracker.get(type).losses += Losses(deck)
      tracker.get(type).trophies += Trophies(deck)
      tracker.get(type).winning += Winning(deck)
      tracker.get(type).losing += Losing(deck)
      tracker.get(type).last_place += LastPlaceFinishes(deck)

      // Sum the values here, and divide them after we iterate all decks.
      if (deck.avg_cmc !== null) {
        tracker.get(type).avg_cmc += deck.avg_cmc
        tracker.get(type).num_cmc_decks += 1
      }
      if (deck.avg_word_count !== null && deck.avg_word_count !== undefined) {
        tracker.get(type).avg_word_count += deck.avg_word_count
        tracker.get(type).num_wc_decks += 1
      }

      // Track who plays this archetype, and how often.
      const who = personLabel(deck)
      if (!tracker.get(type).players.has(who)) {
        tracker.get(type).players.set(who, 0)
      }
      tracker.get(type).players.set(who, tracker.get(type).players.get(who) + 1)

      // Track other types shared with this one, and how frequent.
      for (var k in types) {
        // Skip aggro / control / midrange since those are applied to every deck.
        if (types[k] == "aggro" || types[k] == "midrange" || types[k] == "control") {
          continue
        }
        if (types[k] != type) {
          // Skip itself.
          if (!tracker.get(type).shared_with.has(types[k])) {
            tracker.get(type).shared_with.set(types[k], 0)
          }
          tracker.get(type).shared_with.set(types[k], tracker.get(type).shared_with.get(types[k]) + 1)
          tracker.get(type).num_shared_with += 1
        }
      }
    }
  }

  // Perform calculation on each entry.
  tracker.forEach(function(archetype) {
    archetype.build_percent = Math.round(archetype.count / decks.length * 100)
    archetype.win_percent = Math.round(archetype.wins / (archetype.wins + archetype.losses) * 100)
    const ci = winInterval(archetype.wins, archetype.losses, 0, confidence)
    archetype.win_percent_low = ci.low
    archetype.win_percent_high = ci.high
    archetype.significant = ci.significant
    archetype.percent_of_wins = Math.round(archetype.wins / totalGames * 100)
    archetype.record = archetype.wins + "-" + archetype.losses + "-" + 0
    archetype.avg_shared = Math.round(archetype.num_shared_with / archetype.count * 100) / 100
    if (archetype.num_cmc_decks > 0) {
      archetype.avg_cmc = Math.round(archetype.avg_cmc / archetype.num_cmc_decks * 100) / 100
    } else {
      archetype.avg_cmc = 0
    }
    if (archetype.num_wc_decks > 0) {
      archetype.avg_word_count = Math.round(archetype.avg_word_count / archetype.num_wc_decks * 100) / 100
    } else {
      archetype.avg_word_count = 0
    }
  })
  return tracker
}

function MicroArchetypesChart(input) {
  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of input.parsed.deckBuckets) {
    labels.push(BucketName(bucket))
  }

  // Parse the buckets. First, build up all of the archetypes we're going to display.
  let archSet = new Map()
  for (let bucket of input.parsed.deckBuckets) {
    for (let draft of bucket) {
      for (let deck of draft.decks) {
        for (let a of deck.labels) {
          archSet.set(a, true)
        }
      }
    }
  }

  // Delete macro archetypes, as these plots are specifically about micro archetypes.
  archSet.delete("aggro")
  archSet.delete("midrange")
  archSet.delete("control")

  // We want to fitler out any archtetypes that don't meet a minimum
  // criteria, in order to de-clutter the plots. Use aggregate data across all buckets
  // to determine the play rate, and delete any archetypes that don't meet the criteria
  // before doing per-bucket analysis below.
  input.parsed.archetypeData.forEach((data, arch) => {
    if (data.build_percent <= watermark) {
      archSet.delete(arch)
    }
  })

  // Initialize datasets for each filtered-in archetype.
  let archs = [...archSet.keys()]
  let datasets = new Map()
  for (let arch of archs) {
    datasets.set(arch, [])
  }

  for (let bucket of input.parsed.deckBuckets) {
    let stats = bucket.archetypeData
    for (let archetype of archs) {
      let archetypeStats = stats.get(archetype)
      if (archetypeStats == null) {
        datasets.get(archetype).push(0)
        continue
      }
      if (input.dataset === "wins") {
        datasets.get(archetype).push(archetypeStats.win_percent)
      } else if (input.dataset === "cmc") {
        datasets.get(archetype).push(archetypeStats.avg_cmc)
      } else if (input.dataset === "percent_of_wins") {
        datasets.get(archetype).push(archetypeStats.percent_of_wins)
      } else if (input.dataset === "winning_pct") {
        // % of decks of this archetype with a 2-1 or better record. Denominator
        // is all decks, not just decisive ones. Drop low-sample buckets so we
        // don't draw noise.
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total >= MinWinningPctDecks ? Pct(archetypeStats.winning, total) : null)
      } else if (input.dataset === "trophy_pct") {
        // % of decks of this archetype that won a trophy. Use count (all
        // decks of this archetype) rather than winning + losing, which
        // excludes 2-2 / 1-1 results entirely.
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total > 0 ? Math.round(100 * archetypeStats.trophies / total) : 0)
      } else if (input.dataset === "lastplace_pct") {
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total > 0 ? Math.round(100 * archetypeStats.last_place / total) : 0)
      } else {
        datasets.get(archetype).push(archetypeStats.build_percent)
      }
    }
  }

  let chartDataset = []
  let index = 0
  for (let [arch, data] of datasets) {
    chartDataset.push({
      label: arch,
      data: data,
      borderColor: seriesColor(index),
      backgroundColor: seriesColor(index),
    })
    index += 1
  }

  let title = `Build rate (bucket size = ${input.bucketSize} drafts)`
  switch (input.dataset) {
    case "wins":
      title = `Win rate (bucket size = ${input.bucketSize} drafts)`
      break;
    case "cmc":
      title = `Avg. mana value (bucket size = ${input.bucketSize} drafts)`
      break
    case "percent_of_wins":
      title = `Percent of wins (bucket size = ${input.bucketSize} drafts)`
      break;
    case "winning_pct":
      title = `Winning % (bucket size = ${input.bucketSize} drafts)`
      break;
    case "trophy_pct":
      title = `Trophy % (bucket size = ${input.bucketSize} drafts)`
      break;
    case "lastplace_pct":
      title = `Last place % (bucket size = ${input.bucketSize} drafts)`
      break;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: title,
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: chartDataset};
  return (
    <div style={{"height":"800px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

// MacroArchetypeDeltaChart shows which macro archetypes are net positive or net
// negative relative to the cube-wide average win rate (50%). Green bars point up
// (overperforming), red bars point down, sorted best-to-worst.
function MacroArchetypeDeltaChart(input) {
  let archetypes = input.parsed.archetypeData
  if (archetypes == null) {
    return null
  }

  let rows = []
  for (let arch of archetypes.values()) {
    if (!macroArchetypes.has(arch.type)) {
      continue
    }
    // Skip archetypes with no games so an empty bucket doesn't read as a -50% loser.
    if (arch.wins + arch.losses <= 0) {
      continue
    }
    rows.push({ type: arch.type, delta: arch.win_percent - CUBE_AVG_WIN_PERCENT, winPercent: arch.win_percent, count: arch.count })
  }
  rows.sort((a, b) => b.delta - a.delta)

  if (rows.length === 0) {
    return null
  }

  const labels = rows.map(r => r.type.charAt(0).toUpperCase() + r.type.slice(1))
  const deltas = rows.map(r => r.delta)
  // A function, so Chart.js picks the bar colors again when the scheme changes.
  const barColors = ctx => deltaFill(rows[ctx.dataIndex].delta)

  const data = {
    labels,
    datasets: [
      {
        label: "Win rate vs cube average",
        data: deltas,
        backgroundColor: barColors,
        borderColor: barColors,
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: "Net performance vs cube average (win %)",
        font: { size: "16pt" },
      },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            let r = rows[ctx.dataIndex]
            let sign = r.delta >= 0 ? "+" : ""
            return `${sign}${r.delta.toFixed(1)}% (win ${r.winPercent.toFixed(0)}%, ${r.count} decks)`
          },
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 14 } }, grid: { display: false } },
      y: {
        title: { display: true, text: "Δ win % vs 50%", font: { size: 14 } },
        ticks: { font: { size: 14 }, callback: (v) => (v > 0 ? "+" : "") + v + "%" },
        grid: { color: (ctx) => zeroLineGrid(ctx) },
      },
    },
  }

  return (
    <div style={{ "height": "700px" }}>
      <Bar options={options} data={data} />
    </div>
  )
}

function MacroArchetypesChart(input) {
  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of input.parsed.deckBuckets) {
    labels.push(BucketName(bucket))
  }

  // Parse the buckets.
  let archs = ["aggro", "midrange", "control"]
  let datasets = new Map()
  for (let arch of archs) {
    datasets.set(arch, [])
  }
  for (let bucket of input.parsed.deckBuckets) {
    let stats = bucket.archetypeData
    for (let archetype of archs) {
      let archetypeStats = stats.get(archetype)
      if (archetypeStats == null) {
        datasets.get(archetype).push(0)
        continue
      }
      if (input.dataset === "wins") {
        datasets.get(archetype).push(archetypeStats.win_percent)
      } else if (input.dataset === "percent_of_wins") {
        datasets.get(archetype).push(archetypeStats.percent_of_wins)
      } else if (input.dataset === "cmc") {
        datasets.get(archetype).push(archetypeStats.avg_cmc)
      } else if (input.dataset === "winning_pct") {
        // % of decks of this archetype with a 2-1 or better record. Denominator
        // is all decks, not just decisive ones. Drop low-sample buckets so we
        // don't draw noise.
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total >= MinWinningPctDecks ? Pct(archetypeStats.winning, total) : null)
      } else if (input.dataset === "trophy_pct") {
        // % of decks of this archetype that won a trophy. Use count (all
        // decks of this archetype) rather than winning + losing, which
        // excludes 2-2 / 1-1 results entirely.
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total > 0 ? Math.round(100 * archetypeStats.trophies / total) : 0)
      } else if (input.dataset === "lastplace_pct") {
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total > 0 ? Math.round(100 * archetypeStats.last_place / total) : 0)
      } else {
        datasets.get(archetype).push(archetypeStats.build_percent)
      }
    }
  }

  let chartDataset = [
      {
        label: 'Aggro',
        data: datasets.get("aggro"),
        borderColor: archetypeColor("aggro"),
        backgroundColor: archetypeColor("aggro"),
      },
      {
        label: 'Midrange',
        data: datasets.get("midrange"),
        borderColor: archetypeColor("midrange"),
        backgroundColor: archetypeColor("midrange"),
      },
      {
        label: 'Control',
        data: datasets.get("control"),
        borderColor: archetypeColor("control"),
        backgroundColor: archetypeColor("control"),
      },
  ]

  let title = `Build rate (bucket size = ${input.bucketSize} drafts)`
  switch (input.dataset) {
    case "wins":
      title = `Win rate (bucket size = ${input.bucketSize} drafts)`
      break;
    case "cmc":
      title = `Avg. mana value (bucket size = ${input.bucketSize} drafts)`
      break
    case "percent_of_wins":
      title = `Percent of all wins (bucket size = ${input.bucketSize} drafts)`
      break
    case "winning_pct":
      title = `Winning % (bucket size = ${input.bucketSize} drafts)`
      break
    case "trophy_pct":
      title = `Trophy % (bucket size = ${input.bucketSize} drafts)`
      break
    case "lastplace_pct":
      title = `Last place % (bucket size = ${input.bucketSize} drafts)`
      break
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: title,
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: chartDataset};
  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

// ARCHETYPE_SERIES picks each archetype's chart color from the series palette,
// so aggro, midrange, and control look the same on every chart on the page.
// They're not Magic colors, so they don't use the mana palette.
const ARCHETYPE_SERIES = { aggro: 3, midrange: 1, control: 4 }

// archetypeColor returns an archetype's chart color.
function archetypeColor(archetype) {
  return seriesColor(ARCHETYPE_SERIES[archetype])
}

// PIE_ARCHETYPES are the archetypes the pie charts split decks into.
const PIE_ARCHETYPES = [
  { key: "aggro", label: "Aggro" },
  { key: "midrange", label: "Midrange" },
  { key: "control", label: "Control" },
]

// MacroArchetypesPieChart splits decks, or wins, between the archetypes. An
// archetype with no decks in the range is left out rather than breaking the
// chart.
function MacroArchetypesPieChart(input) {
  let stats = input.parsed.archetypeData

  let title = `Decks`
  let field = "count"
  if (input.dataset === "wins") {
    title = `Wins`
    field = "wins"
  }

  const labels = []
  const graphData = []
  const fills = []
  const borders = []
  for (const archetype of PIE_ARCHETYPES) {
    const archetypeStats = stats.get(archetype.key)
    if (!archetypeStats) {
      continue
    }
    const color = archetypeColor(archetype.key)
    labels.push(archetype.label)
    graphData.push(archetypeStats[field])
    fills.push(withAlpha(color, 0.35))
    borders.push(color)
  }

  let data = {
    labels,
    datasets: [
      {
        label: title,
        data: graphData,
        backgroundColor: fills,
        borderColor: borders,
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: title,
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Pie height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function WinsByMatchup(input) {
  // The server sends no items when no deck has an archetype.
  const items = input.matchups?.items || []
  if (items.length === 0) {
    return null
  }

  // For now, just use the first matchup.
  let matchup = items[0]
  for (let m of items) {
    if (m.name == input.focus) {
      matchup = m;
      break;
    }
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: "Matchup data for " + matchup.name,
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  // Sort the vs. by relative "speed" - i.e., aggro, midrange, control.
  let versus = new Array()
  let find = function(t) {
    if (matchup.versus == null) {
      return {
        name: t,
        win: 0,
        loss: 0,
      }
    }

    for (let vs of matchup.versus) {
      if (vs.name == t) {
        return vs
      }
    }

    // Not found. Return a dummy.
    return {
      name: t,
      win: 0,
      loss: 0,
    }
  }

  let ats = ["aggro", "midrange", "control"]
  for (let n of ats) {
    if (n == matchup.name) {
      continue;
    }
    versus.push(find(n))
  }

  var labels = []
  let winsData= []
  let lossData = []
  let percentages = []
  for (let vs of versus) {
    labels.push(vs.name)
    winsData.push(vs.win)
    lossData.push(vs.loss)
    percentages.push(Pct(vs.win, vs.win + vs.loss))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: () => currentChartTheme().goodFill,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: () => currentChartTheme().badFill,
      },

    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
