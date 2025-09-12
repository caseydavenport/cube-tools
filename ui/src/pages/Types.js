import React from 'react'
import { IsBasicLand, SortFunc, StringToColor } from "../utils/Utils.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { BucketName } from "../utils/Buckets.js"
import { Red, Green, Black, White, Blue, Colors, ColorImages } from "../utils/Colors.js"

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import {
  Tooltip as TooltipJS,
} from 'react-bootstrap';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';

// Register chart JS objects that we need to use.
ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// The mark an archetype must hit to be included in this page.
// Set a default here that roughly maps to once every other draft.
const watermark = 100 / 16

const winPctColor = "#fff"
const winColor = Green
const lossColor = Black // "#61892f"

export function ArchetypeWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <table style={{"width": "100%"}}>
      <tbody>
        <tr style={{"height": "800px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <ArchetypeStatsTable
              parsed={input.parsed}
              decks={input.decks}
              dropdownSelection={input.colorTypeSelection}
              sortBy={input.sortBy}
              onHeaderClick={input.onHeaderClick}
              handleRowClick={input.handleRowClick}
              selectedArchetype={input.selectedArchetype}
              colorCheckboxes={input.colorCheckboxes}
              onColorChecked={input.onColorChecked}
            />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <TopCardsInArchetypeWidget
              parsed={input.parsed}
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
          </td>
          <td style={{"verticalAlign":"top"}}>
            <ArchetypeDetailsPanel
              parsed={input.parsed}
              decks={input.decks}
              selectedArchetype={input.selectedArchetype}
            />
          </td>
        </tr>
        <tr>
          <td>
            <MacroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="builds"
            />
          </td>
          <td colSpan="2">
            <MacroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="wins"
            />
          </td>
        </tr>

        <tr>
          <td colSpan="3">
            <MacroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="percent_of_wins"
            />
          </td>
        </tr>

        <tr>
          <td colSpan="1">
            <WinsByMatchup
              focus="aggro"
              matchups={input.matchups}
            />
          </td>
          <td colSpan="2">
            <WinsByMatchup
              focus="tempo"
              matchups={input.matchups}
            />
          </td>
        </tr>

        <tr>
          <td colSpan="1">
            <WinsByMatchup
              focus="midrange"
              matchups={input.matchups}
            />
          </td>
          <td colSpan="2">
            <WinsByMatchup
              focus="control"
              matchups={input.matchups}
            />
          </td>
        </tr>

        <tr>
          <td>
            <MacroArchetypesPieChart
              parsed={input.parsed}
              decks={input.decks}
              dataset="builds"
            />
          </td>
          <td colSpan="2">
            <MacroArchetypesPieChart
              parsed={input.parsed}
              decks={input.decks}
              dataset="wins"
            />
          </td>
        </tr>

        <tr>
          <td colSpan="3" style={{"paddingTop": "100px"}}>
            <MacroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="cmc"
            />
          </td>
        </tr>

        <tr>
          <td colSpan="3" style={{"paddingTop": "100px"}}>
            <MicroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="builds"
            />
          </td>
        </tr>

        <tr>
          <td colSpan="2" style={{"paddingTop": "100px"}}>
            <MicroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="wins"
            />
          </td>
        </tr>

        <tr>
          <td colSpan="3">
            <MicroArchetypesChart
              parsed={input.parsed}
              decks={input.decks}
              bucketSize={input.bucketSize}
              dataset="percent_of_wins"
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ArchetypeStatsTable(input) {
  let archetypes = input.parsed.archetypeData
  let data = []
  for (let arch of archetypes.values()) {
    if (arch.build_percent >= watermark) {
      data.push(arch)
    }
  }

  let headers = [
    {
      id: "type",
      text: "Tag",
      tip: "Archetype (aggro / midrange / control) or tag applied to a deck. A deck may have multiple tags"
    },
    {
      id: "build_percent",
      text: "Build %",
      tip: "Percentage of all built decks that have this archetype / tag.",
    },
    {
      id: "win_percent",
      text: "Win %",
      tip: "Win percentage of decks that have this archetype / tag.",
    },
    {
      id: "pwin",
      text: "% of wins",
      tip: "Number of wins from decks with this tag, divided by the total number of wins across all decks.",
    },
    {
      id: "trophies",
      text: "Trophies",
      tip: "Number of 3-0 decks of this archetype / tag.",
    },
    {
      id: "lastplace",
      text: "Last place",
      tip: "Number of 0-3 decks of this archetype / tag.",
    },
    {
      id: "num",
      text: "# Decks",
      tip: "Total number of decks with this archetype / tag.",
    },
    {
      id: "shared",
      text: "Avg other types",
      tip: "Average number of other tags applied to decks with this archetype / tag.",
    },
  ]

  return (
    <div>
      <ColorPickerHeader display={input.colorCheckboxes} onChecked={input.onColorChecked} />
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            {
              headers.map(function(hdr, i) {
                return (
                  <OverlayTrigger
                    key={i}
                    placement="top"
                    delay={{ show: 100, hide: 100 }}
                    overlay={
                      <Popover id="popover-basic">
                        <Popover.Header as="h3">{hdr.text}</Popover.Header>
                        <Popover.Body>
                          {hdr.tip}
                        </Popover.Body>
                      </Popover>
                    }
                  >
                    <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                  </OverlayTrigger>
                );
              })
            }
          </tr>
        </thead>
        <tbody>
          {
            data.map(function(t) {
              let sort = t.build_percent
              switch (input.sortBy) {
                case "type":
                  sort = t.type;
                  break;
                case "win_percent":
                  sort = t.win_percent;
                  break;
                case "shared":
                  sort = t.avg_shared;
                  break;
                case "num":
                  sort = t.count;
                  break;
                case "pwin":
                  sort = t.percent_of_wins;
                  break;
                case "trophies":
                  sort = t.threeoh;
                  break;
                case "lastplace":
                  sort = t.ohthree;
                  break;
              }
              return (
                <tr key={t.type} sort={sort} className="widget-table-row">
                  <td id={t.type} onClick={input.handleRowClick} key="type">{t.type}</td>
                  <td key="build_percent">{t.build_percent}%</td>
                  <td key="win_percent">{t.win_percent}%</td>
                  <td key="pwin">{t.percent_of_wins}%</td>
                  <td key="trophies">{t.threeoh}</td>
                  <td key="lastplace">{t.ohthree}</td>
                  <td key="num">{t.count}</td>
                  <td key="shared">{t.avg_shared}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

function ColorPickerHeader(input) {
  return (
    <div className="full-options-header">
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
    <div className="dropdown-header">
      <DropdownHeader
        label="Archetype"
        options={input.archetypeDropdownOptions}
        value={input.selectedArchetype}
        onChange={input.onArchetypeSelected}
        className="dropdown-header-side-by-side"
      />

      <DropdownHeader
        label="Color"
        options={input.colorWidgetOpts}
        value={input.colorSelection}
        onChange={input.onColorSelected}
        className="dropdown-header-side-by-side"
      />

      <NumericInput
        label="Min #picks"
        value={input.minDrafts}
        onChange={input.onMinDraftsSelected}
        className="dropdown-header-side-by-side"
      />

      <NumericInput
        label="Decks in arch"
        value={input.minDecksInArch}
        onChange={input.onMinGamesSelected}
        className="dropdown-header-side-by-side"
      />
    </div>
  );
}

function TopCardsInArchetypeWidget(input) {
  // Get all cards that are currently active.
  let data = input.parsed.cardData
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
    <div className="widget-scroll">
      <TopCardsInArchetypeWidgetOptions {...input} />
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            {
              headers.map(function(hdr, i) {
                return (
                  <OverlayTrigger
                    key={i}
                    placement="top"
                    delay={{ show: 100, hide: 100 }}
                    overlay={
                      <Popover id="popover-basic">
                        <Popover.Header as="h3">{hdr.text}</Popover.Header>
                        <Popover.Body>
                          {hdr.tip}
                        </Popover.Body>
                      </Popover>
                    }
                  >
                    <td id={hdr.id} className="header-cell">{hdr.text}</td>
                  </OverlayTrigger>
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

              // Determine what percentage of decks in the archetype this card has been in.
              let percentage = Math.round(cardArch.get(input.selectedArchetype) / archetypes.get(input.selectedArchetype).count * 100)

              // Determine how tightly bound this card is to the archetype - is it 1:1? Or does it share its time in
              // other decks.
              let correlation = Math.round(cardArch.get(input.selectedArchetype) / card.mainboard * 100)

              // Configure the sort.
              let sort = cardArch.get(input.selectedArchetype)
              sort = correlation
              return (
                <tr sort={sort} className="widget-table-row" key={card.name}>
                  <td ><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td >{cardArch.get(input.selectedArchetype)}</td>
                  <td >{percentage}%</td>
                  <td >{correlation}%</td>
                </tr>
            )}).sort(SortFunc)
          }
        </tbody>
      </table>
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
    arch.sharedWith.forEach(function(num, name) {
      sharedData.push({"name": name, "num": num})
    })
    arch.players.forEach(function(num, name) {
      playerData.push({"name": name, "num": num})
    })
  }
  return (
    <div>
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Paired with</td>
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

      <br></br>

      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Played by</td>
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
  );
}

export function ArchetypeData(decks) {
  let newType = function(type) {
    return {
      type: type,
      count: 0,
      wins: 0,
      losses: 0,
      sharedWith: new Map(),
      numSharedWith: 0,
      players: new Map(),
      build_percent: 0,
      win_percent: 0,
      avg_shared: 0,
      avg_cmc: 0,
      threeoh: 0,
      ohthree: 0,
    }
  }

  // First, determine the popularity of each archetype by iterating all decks
  // and counting the instances of each.
  let totalGames = 0
  let tracker = new Map()

  // We set aggro/midrange/control/tempo for every set of decks, even if they are
  // zeroed out. This enables graphs that expect these to exist.
  tracker.set("aggro", newType("aggro"))
  tracker.set("midrange", newType("midrange"))
  tracker.set("control", newType("control"))
  tracker.set("tempo", newType("tempo"))

  for (let deck of decks) {
    // We only need to count wins, because every loss is counted in another deck as a win.
    totalGames += Wins(deck)

    let types = deck.labels
    for (let type of types) {
      if (!tracker.has(type)) {
        tracker.set(type, newType(type))
      }
      tracker.get(type).count += 1
      tracker.get(type).wins += Wins(deck)
      tracker.get(type).losses += Losses(deck)
      tracker.get(type).threeoh += Trophies(deck)
      tracker.get(type).ohthree += LastPlaceFinishes(deck)

      // Sum the values here, and divide them after we iterate all decks.
      tracker.get(type).avg_cmc += deck.avg_cmc

      // Track who plays this archetype, and how often.
      if (!tracker.get(type).players.has(deck.player)) {
        tracker.get(type).players.set(deck.player, 0)
      }
      tracker.get(type).players.set(deck.player, tracker.get(type).players.get(deck.player) + 1)

      // Track other types shared with this one, and how frequent.
      for (var k in types) {
        // Skip aggro / control / midrange since those are applied to every deck.
        if (types[k] == "aggro" || types[k] == "midrange" || types[k] == "control") {
          continue
        }
        if (types[k] != type) {
          // Skip itself.
          if (!tracker.get(type).sharedWith.has(types[k])) {
            tracker.get(type).sharedWith.set(types[k], 0)
          }
          tracker.get(type).sharedWith.set(types[k], tracker.get(type).sharedWith.get(types[k]) + 1)
          tracker.get(type).numSharedWith += 1
        }
      }
    }
  }

  // Perform calculation on each entry.
  tracker.forEach(function(archetype) {
    archetype.build_percent = Math.round(archetype.count / decks.length * 100)
    archetype.win_percent = Math.round(archetype.wins / (archetype.wins + archetype.losses) * 100)
    archetype.percent_of_wins = Math.round(archetype.wins / totalGames * 100)
    archetype.record = archetype.wins + "-" + archetype.losses + "-" + 0
    archetype.avg_shared = Math.round(archetype.numSharedWith / archetype.count * 100) / 100
    archetype.avg_cmc = Math.round(archetype.avg_cmc / archetype.count * 100) / 100
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
  archSet.delete("tempo")

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
      } else {
        datasets.get(archetype).push(archetypeStats.build_percent)
      }
    }
  }

  let chartDataset = []
  for (let [arch, data] of datasets) {
    chartDataset.push({
      label: arch,
      data: data,
      borderColor: StringToColor(arch),
      backgroundColor: StringToColor(arch),
    })
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
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
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

function MacroArchetypesChart(input) {
  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of input.parsed.deckBuckets) {
    labels.push(BucketName(bucket))
  }

  // Parse the buckets.
  let archs = ["aggro", "midrange", "control", "tempo"]
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
      } else {
        datasets.get(archetype).push(archetypeStats.build_percent)
      }
    }
  }

  let chartDataset = [
      {
        label: 'Aggro',
        data: datasets.get("aggro"),
        borderColor: Colors.get("R"),
        backgroundColor: Colors.get("R"),
      },
      {
        label: 'Midrange',
        data: datasets.get("midrange"),
        borderColor: Colors.get("G"),
        backgroundColor: Colors.get("G"),
      },
      {
        label: 'Control',
        data: datasets.get("control"),
        borderColor: Colors.get("U"),
        backgroundColor: Colors.get("U"),
      },
      {
        label: 'Tempo',
        data: datasets.get("tempo"),
        borderColor: Colors.get("B"),
        backgroundColor: Colors.get("B"),
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
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: chartDataset};
  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function MacroArchetypesPieChart(input) {
  let stats = input.parsed.archetypeData

  let title = `Decks`
  let graphData = [
    stats.get("aggro").count,
    stats.get("midrange").count,
    stats.get("control").count,
    stats.get("tempo").count,
  ]

  switch (input.dataset) {
    case "wins":
      title = `Wins`
      graphData = [
        stats.get("aggro").wins,
        stats.get("midrange").wins,
        stats.get("control").wins,
        stats.get("tempo").wins,
      ]
  }

  let data = {
    labels: ['Aggro', 'Midrange', 'Control', 'Tempo'],
    datasets: [
      {
        label: title,
        data: graphData,
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(255, 206, 86, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(94, 122, 135, 0.2)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(94, 122, 135, 1)',
        ],
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
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Pie height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function WinsByMatchup(input) {
  // For now, just use the first matchup.
  let matchup = input.matchups.items[0]
  for (let m of input.matchups.items) {
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
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  // Sort the vs. by relative "speed" - i.e., aggro, tempo,
  // midrange, control.
  let versus = new Array()
  let find = function(t) {
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

  let ats = ["aggro", "tempo", "midrange", "control"]
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
    percentages.push(Math.round(100 * vs.win / (vs.win + vs.loss)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: winPctColor,
        backgroundColor: winPctColor,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}

