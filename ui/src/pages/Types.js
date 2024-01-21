import React from 'react'
import { CardData } from "../utils/Cards.js"
import { IsBasicLand, SortFunc, StringToColor } from "../utils/Utils.js"
import { Wins, Losses } from "../utils/Deck.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { DeckBuckets } from "../utils/Buckets.js"

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

export function ArchetypeWidget(input) {
  if (!input.show) {
    return null
  }

  // Filter decks based on selected colors. This enables us to view data for a subset of colors.
  // Combine the colors using a logical AND to enable us to view two-color decks. If no colors are selected,
  // then use all decks.
  let decks = input.decks
  let filterByColor = input.colorCheckboxes.some(function(element) {return element})
  if (filterByColor) {
    decks = []
    let enabledColors = checkboxesToColors(input.colorCheckboxes)
    for (let deck of input.decks) {
      let deckMatches = true
      for (let color of enabledColors) {
        if (!deck.colors.includes(color)) {
          deckMatches = false
          break
        }
      }
      if (deckMatches) {
        decks.push(deck)
      }
    }
  }

  return (
    <table style={{"width": "100%"}}>
      <tr style={{"height": "800px"}}>
        <td style={{"verticalAlign": "top", "width": "50%"}}>
          <ArchetypeStatsTable
            decks={decks}
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
            decks={decks}
            minDrafts={input.minDrafts}
            cube={input.cube}
            minDecksInArch={input.minDecksInArch}
            archetypeDropdownOptions={input.archetypeDropdownOptions}
            selectedArchetype={input.selectedArchetype}
            onArchetypeSelected={input.onArchetypeSelected}
            dropdownSelection={input.cardWidgetSelection}
            cardWidgetOpts={input.cardWidgetOpts}
            onSelected={input.onCardWidgetSelected}
            colorWidgetOpts={input.colorWidgetOpts}
            onColorSelected={input.onColorSelected}
            colorSelection={input.colorSelection}
            onMinDraftsSelected={input.onMinDraftsSelected}
            onMinGamesSelected={input.onMinGamesSelected}
          />
        </td>
        <td style={{"verticalAlign":"top"}}>
          <ArchetypeDetailsPanel
            decks={decks}
            selectedArchetype={input.selectedArchetype}
          />
        </td>
      </tr>
      <tr>
        <td>
          <MacroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="builds"
          />
        </td>
        <td colSpan="2">
          <MacroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="wins"
          />
        </td>
      </tr>

      <tr>
        <td colSpan="3">
          <MacroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="percent_of_wins"
          />
        </td>
      </tr>

      <tr>
        <td>
          <MacroArchetypesPieChart
            decks={decks}
            dataset="builds"
          />
        </td>
        <td colSpan="2">
          <MacroArchetypesPieChart
            decks={decks}
            dataset="wins"
          />
        </td>
      </tr>

      <tr>
        <td colSpan="3" style={{"paddingTop": "100px"}}>
          <MacroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="cmc"
          />
        </td>
      </tr>

      <tr>
        <td colSpan="3" style={{"paddingTop": "100px"}}>
          <MicroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="builds"
          />
        </td>
      </tr>

      <tr>
        <td colSpan="2" style={{"paddingTop": "100px"}}>
          <MicroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="wins"
          />
        </td>
      </tr>

      <tr>
        <td colSpan="3">
          <MicroArchetypesChart
            decks={decks}
            bucketSize={input.bucketSize}
            dataset="percent_of_wins"
          />
        </td>
      </tr>
    </table>
  );
}

function checkboxesToColors(checkboxes) {
  let colors = []
  if (checkboxes[0]) {
    colors.push("W")
  }
  if (checkboxes[1]) {
    colors.push("U")
  }
  if (checkboxes[2]) {
    colors.push("B")
  }
  if (checkboxes[3]) {
    colors.push("R")
  }
  if (checkboxes[4]) {
    colors.push("G")
  }
  return colors
}

function ArchetypeStatsTable(input) {
  let archetypes = ArchetypeData(input.decks)
  let data = []
  for (let arch of archetypes.values()) {
    if (arch.build_percent > 5) {
      data.push(arch)
    }
  }

  return (
    <div>
      <ColorPickerHeader display={input.colorCheckboxes} onChecked={input.onColorChecked} />
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="type" className="header-cell">Archetype</td>
            <td onClick={input.onHeaderClick} id="build_percent" className="header-cell">Build %</td>
            <td onClick={input.onHeaderClick} id="win_percent" className="header-cell">Win %</td>
            <td onClick={input.onHeaderClick} id="pwin" className="header-cell">% of wins</td>
            <td onClick={input.onHeaderClick} id="num" className="header-cell"># Decks</td>
            <td onClick={input.onHeaderClick} id="record" className="header-cell">Record</td>
            <td onClick={input.onHeaderClick} id="shared" className="header-cell">Avg other types</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map(function(t) {
              let sort = t.build_percent
              switch (input.sortBy) {
                case "type":
                  sort = t.type;
                  break
                case "win_percent":
                  sort = t.win_percent;
                  break
                case "shared":
                  sort = t.avg_shared;
                  break
                case "num":
                  sort = t.count;
                  break
                case "pwin":
                  sort = t.percent_of_wins;
                  break
              }
              return (
                <tr key={t.type} sort={sort} className="winrate-row">
                  <td id={t.type} onClick={input.handleRowClick} key="type">{t.type}</td>
                  <td key="build_percent">{t.build_percent}%</td>
                  <td key="win_percent">{t.win_percent}%</td>
                  <td key="pwin">{t.percent_of_wins}%</td>
                  <td key="num">{t.count}</td>
                  <td key="record">{t.record}</td>
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
        text="W"
        id="W"
        checked={input.display[0]}
        onChange={input.onChecked}
      />
      <Checkbox
        text="U"
        id="U"
        checked={input.display[1]}
        onChange={input.onChecked}
      />
      <Checkbox
        text="B"
        id="B"
        checked={input.display[2]}
        onChange={input.onChecked}
      />
      <Checkbox
        text="R"
        id="R"
        checked={input.display[3]}
        onChange={input.onChecked}
      />
      <Checkbox
        text="G"
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
  let data = CardData(input.decks, input.minDrafts, 0, input.cube, input.colorSelection)
  let archetypes = ArchetypeData(input.decks)

  // Filter out cards that don't match the given archetype, or don't meet minimum
  // requirements.
  let filtered = new Array()
  data.map(function(card) {
    if (!card.archetypes.has(input.selectedArchetype)) {
      return
    }
    if (card.archetypes.get(input.selectedArchetype) < input.minDecksInArch) {
      return
    }
    filtered.push(card)
  })

  return (
    <div className="widget-scroll">
      <TopCardsInArchetypeWidgetOptions {...input} />
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td className="header-cell">Card</td>
            <td className="header-cell"># decks in arch</td>
            <td className="header-cell">% of decks</td>
            <td className="header-cell">correlation</td>
          </tr>
        </thead>
        <tbody>
          {
            filtered.map(function(card) {
              // Determine what percentage of decks in the archetype this card has been in.
              let percentage = Math.round(card.archetypes.get(input.selectedArchetype) / archetypes.get(input.selectedArchetype).count * 100)

              // Determine how tightly bound this card is to the archetype - is it 1:1? Or does it share its time in
              // other decks.
              let correlation = Math.round(card.archetypes.get(input.selectedArchetype) / card.mainboard * 100)
              return (
                <tr sort={correlation} className="card" key={card.name}>
                  <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td >{card.archetypes.get(input.selectedArchetype)}</td>
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
  let archetypeData = ArchetypeData(input.decks)
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
      <table className="winrate-table">
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
                <tr key={arch.name} sort={arch.num} className="winrate-row">
                  <td key="name">{arch.name}</td>
                  <td key="num">{arch.num}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>

      <br></br>

      <table className="winrate-table">
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
                <tr key={player.name} sort={player.num} className="winrate-row">
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

    let types = deck.labels
    for (let type of types) {
      if (!tracker.has(type)) {
        tracker.set(type, newType(type))
      }
      tracker.get(type).count += 1
      tracker.get(type).wins += Wins(deck)
      tracker.get(type).losses += Losses(deck)

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
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
  }

  // Parse the buckets. First, build up all of the archetypes we're going to display.
  let archSet = new Map()
  for (let bucket of buckets) {
    for (let draft of bucket) {
      for (let deck of draft.decks) {
        for (let a of deck.labels) {
          archSet.set(a, true)
        }
      }
    }
  }
  archSet.delete("aggro")
  archSet.delete("midrange")
  archSet.delete("control")
  let archs = [...archSet.keys()]

  let datasets = new Map()
  for (let arch of archs) {
    datasets.set(arch, [])
  }
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Parse the stats of the decks.
    let stats = ArchetypeData(decks)
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
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
  }

  // Parse the buckets.
  let archs = ["aggro", "midrange", "control"]
  let datasets = new Map()
  for (let arch of archs) {
    datasets.set(arch, [])
  }
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Parse the stats of the decks.
    let stats = ArchetypeData(decks)
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
        borderColor: "#F00",
        backgroundColor: '#F00',
      },
      {
        label: 'Midrange',
        data: datasets.get("midrange"),
        borderColor: "#0F0",
        backgroundColor: "#0F0",
      },
      {
        label: 'Control',
        data: datasets.get("control"),
        borderColor: "#00F",
        backgroundColor: '#00F',
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
  let stats = ArchetypeData(input.decks)

  let title = `Decks`
  let graphData = [
    stats.get("aggro").count,
    stats.get("midrange").count,
    stats.get("control").count,
  ]

  switch (input.dataset) {
    case "wins":
      title = `Wins`
      graphData = [
        stats.get("aggro").wins,
        stats.get("midrange").wins,
        stats.get("control").wins,
      ]
  }

  let data = {
    labels: ['Aggro', 'Midrange', 'Control'],
    datasets: [
      {
        label: title,
        data: graphData,
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(255, 206, 86, 0.2)',
          'rgba(54, 162, 235, 0.2)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(54, 162, 235, 1)',
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
