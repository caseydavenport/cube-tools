import React from 'react'
import { SortFunc } from "../utils/Utils.js"
import { NumericInput } from "../components/Dropdown.js"
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

export function SynergyWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <div style={{"width": "100%"}}>
      <SynergyWidgetOptions {...input} />
      <SynergyWidgetTable {...input} />
    </div>
  );
}

function SynergyWidgetOptions(input) {
  return (
    <div className="scroll-container-large-header">
    <table className="scroll-container-large-header">
      <tbody>
        <tr>
          <td className="selection-cell">
            Showing top {input.synergyData.length} synergistic pairs
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Min decks"
              value={input.minSynergyDecks}
              onChange={input.onMinSynergyDecksChanged}
            />
          </td>
        </tr>
      </tbody>
    </table>
    </div>
  );
}

function sortValue(sortBy, pair) {
  switch (sortBy) {
    case "card1":
      return pair.card1
    case "card2":
      return pair.card2
    case "count":
      return pair.count
    case "synergy":
      return pair.synergy_score
    default:
      return pair.synergy_score
  }
}

function SynergyWidgetTable(input) {
  let headers = [
    {
      id: "card1",
      text: "Card 1",
      tip: "The first card in the synergistic pair."
    },
    {
      id: "card2",
      text: "Card 2",
      tip: "The second card in the synergistic pair."
    },
    {
      id: "count",
      text: "Count",
      tip: "The number of decks both cards appeared in together."
    },
    {
      id: "synergy",
      text: "Synergy (Lift)",
      tip: "How much more likely these cards are to be played together than by chance (Observed / Expected)."
    },
  ]

  return (
    <div className="scroll-container-large">
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
            input.synergyData.map(function(pair, i) {
              let sort = sortValue(input.sortBy, pair)
              // Since SortFunc sorts descending for numeric and we want ascending for strings sometimes, 
              // but here we just follow the pattern.
              
              return (
                <tr className="widget-table-row" sort={sort} key={i}>
                  <td id={pair.card1} onClick={input.onCardSelected}>
                    {pair.card1}
                  </td>
                  <td id={pair.card2} onClick={input.onCardSelected}>
                    {pair.card2}
                  </td>
                  <td>{pair.count}</td>
                  <td>{pair.synergy_score.toFixed(2)}x</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}
