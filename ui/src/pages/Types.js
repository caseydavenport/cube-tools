import React from 'react'
import { CardData } from "../utils/Cards.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
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

  return (
    <table style={{"width": "100%"}}>
      <tr style={{"height": "800px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <ArchetypeStatsTable
            decks={input.decks}
            dropdownSelection={input.colorTypeSelection}
            sortBy={input.sortBy}
            onHeaderClick={input.onHeaderClick}
            handleRowClick={input.handleRowClick}
            selectedArchetype={input.selectedArchetype}
          />
        </td>
        <td style={{"vertical-align": "top"}}>
          <TopCardsInArchetypeWidget
            decks={input.decks}
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
        <td style={{"vertical-align":"top"}}>
          <ArchetypeDetailsPanel
            decks={input.decks}
            selectedArchetype={input.selectedArchetype}
          />
        </td>
      </tr>
      <tr>
        <td>
          <MacroArchetypesChart
            decks={input.decks}
            dataset="builds"
          />
        </td>
        <td colspan="2">
          <MacroArchetypesChart
            decks={input.decks}
            dataset="wins"
          />
        </td>
      </tr>

      <tr>
        <td>
          <MacroArchetypesPieChart
            decks={input.decks}
            dataset="builds"
          />
        </td>
        <td colspan="2">
          <MacroArchetypesPieChart
            decks={input.decks}
            dataset="wins"
          />
        </td>
      </tr>


    </table>
  );
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
  let arch = archetypeData.get(input.selectedArchetype)
  let sharedData = []
  arch.sharedWith.forEach(function(num, name) {
    sharedData.push({"name": name, "num": num})
  })
  let playerData = []
  arch.players.forEach(function(num, name) {
    playerData.push({"name": name, "num": num})
  })
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
  // First, determine the popularity of each archetype by iterating all decks
  // and counting the instances of each.
  let totalWins = 0
  let tracker = new Map()
  for (let deck of decks) {
    let types = deck.labels
    totalWins += Wins(deck)
    for (let type of types) {
      if (!tracker.has(type)) {
        tracker.set(type, {
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
        })
      }
      tracker.get(type).count += 1
      tracker.get(type).wins += Wins(deck)
      tracker.get(type).losses += Losses(deck)

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
    archetype.percent_of_wins = Math.round(archetype.wins / totalWins * 100)
    archetype.record = archetype.wins + "-" + archetype.losses + "-" + 0
    archetype.avg_shared = Math.round(archetype.numSharedWith / archetype.count * 100) / 100
  })
  return tracker
}

function MacroArchetypesChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let numBuckets = 10
  let buckets = DeckBuckets(input.decks, numBuckets)

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
      if (input.dataset == "wins") {
        datasets.get(archetype).push(stats.get(archetype).win_percent)
      } else {
        datasets.get(archetype).push(stats.get(archetype).build_percent)
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

  let title = `Build rate (buckets=${numBuckets})`
  switch (input.dataset) {
    case "wins":
      title = `Win rate (buckets=${numBuckets})`
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
