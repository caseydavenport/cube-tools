import React from 'react'
import { CardData } from "../utils/Cards.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { Wins, Losses } from "../utils/Deck.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"

export function ArchetypeWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <div>
      <ArchetypeStatsTable
        decks={input.decks}
        dropdownSelection={input.colorTypeSelection}
        sortBy={input.sortBy}
        onHeaderClick={input.onHeaderClick}
        handleRowClick={input.handleRowClick}
        showPopup={input.showPopup}
      />

      <TopCardsInArchetypeWidget
        decks={input.decks}
        minDrafts={input.minDrafts}
        cube={input.cube}
        minDecksInArch={input.minGames} // We overload the use of minGames here.
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

      <ArchetypeDetailsPanel
        decks={input.decks}
        showPopup={input.showPopup}
      />
    </div>
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
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="type" className="header-cell">Archetype</td>
            <td onClick={input.onHeaderClick} id="build_percent" className="header-cell">Build %</td>
            <td onClick={input.onHeaderClick} id="win_percent" className="header-cell">Win %</td>
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
                  sort = t.type
                  break
                case "win_percent":
                  sort = t.win_percent
                  break
                case "shared":
                  sort = t.avg_shared
                  break
                case "num":
                  sort = t.count
                  break
              }
              return (
                <tr key={t.type} sort={sort} className="winrate-row">
                  <td id={t.type} onClick={input.handleRowClick} key="type">{t.type}</td>
                  <td key="build_percent">{t.build_percent}%</td>
                  <td key="win_percent">{t.win_percent}%</td>
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
    <div className="widget">
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
  if (input.showPopup == "") {
    return null
  }

  // Get the archetype data for the selected archetype.
  let archetypeData = ArchetypeData(input.decks)
  let arch = archetypeData.get(input.showPopup)
  let sharedData = []
  arch.sharedWith.forEach(function(num, name) {
    sharedData.push({"name": name, "num": num})
  })
  let playerData = []
  arch.players.forEach(function(num, name) {
    playerData.push({"name": name, "num": num})
  })
  return (
    <div className="widget">
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

  )
}

export function ArchetypeData(decks) {
  // First, determine the popularity of each archetype by iterating all decks
  // and counting the instances of each.
  let tracker = new Map()
  for (var i in decks) {
    let types = decks[i].labels
    for (var j in types) {
      let type = types[j]
      if (!tracker.has(type)) {
        tracker.set(type, {
          type: type,
          count: 0,
          wins: 0,
          losses: 0,
          sharedWith: new Map(),
          numSharedWith: 0,
          players: new Map(),
        })
      }
      tracker.get(type).count += 1
      tracker.get(type).wins += Wins(decks[i])
      tracker.get(type).losses += Losses(decks[i])

      // Track who plays this archetype, and how often.
      if (!tracker.get(type).players.has(decks[i].player)) {
        tracker.get(type).players.set(decks[i].player, 0)
      }
      tracker.get(type).players.set(decks[i].player, tracker.get(type).players.get(decks[i].player) + 1)


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
    archetype.record = archetype.wins + "-" + archetype.losses + "-" + 0
    archetype.avg_shared = Math.round(archetype.numSharedWith / archetype.count * 100) / 100
  })
  return tracker
}

