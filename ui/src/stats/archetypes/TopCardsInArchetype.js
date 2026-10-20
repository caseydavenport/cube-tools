// The top cards in each archetype, with a color picker and a details panel
// for the picked archetype.

import React from 'react'
import { SortFunc } from "../../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { ColorImages } from "../../utils/Colors.js"
import { archetypeShare } from "./ArchetypeStatsTable.js"

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

export function TopCardsInArchetypeWidget(input) {
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

export function ArchetypeDetailsPanel(input) {
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
