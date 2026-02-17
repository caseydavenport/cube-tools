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
    <div className="synergy-container" style={{"padding": "1rem"}}>
      <SynergyWidgetOptions {...input} />
      <div className="synergy-grid" style={{"marginTop": "1rem"}}>
        <SynergyWidgetTable {...input} />
      </div>
    </div>
  );
}

function SynergyWidgetOptions(input) {
  let pairs = input.synergyData.pairs || []
  return (
    <div className="scroll-container-large-header" style={{"width": "100%", "margin": "0"}}>
      <div className="selector-group">
        <div className="selection-cell">
          Showing top {pairs.length} synergistic pairs
        </div>
        <NumericInput
          label="Min decks"
          value={input.minSynergyDecks}
          onChange={input.onMinSynergyDecksChanged}
        />
      </div>
    </div>
  );
}

function sortValue(sortBy, pair) {
  switch (sortBy) {
    case "card1": return pair.card1
    case "card2": return pair.card2
    case "count": return pair.count
    case "synergy": return pair.synergy_score
    case "winpercent": return pair.win_percent
    default: return pair.synergy_score
  }
}

function SynergyWidgetTable(input) {
  let pairs = input.synergyData.pairs || []
  let headers = [
    { id: "card1", text: "Card 1", tip: "First card in pair." },
    { id: "card2", text: "Card 2", tip: "Second card in pair." },
    { id: "winpercent", text: "Win %", tip: "Aggregate win % of decks with both." },
    { id: "count", text: "#", tip: "Number of decks." },
    { id: "synergy", text: "Syn", tip: "Synergy score (Lift)." },
  ]

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr><td colSpan="5" className="header-cell" style={{"textAlign": "center", "fontWeight": "bold", "background": "var(--primary)", "color": "var(--page-background)"}}>Synergistic Pairs</td></tr>
          <tr>
          {headers.map((hdr, i) => (
            <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }} overlay={<Popover id="popover-basic"><Popover.Header as="h3">{hdr.text}</Popover.Header><Popover.Body>{hdr.tip}</Popover.Body></Popover>}>
              <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
            </OverlayTrigger>
          ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, i) => (
            <tr className="widget-table-row" sort={sortValue(input.sortBy, pair)} key={i}>
              <td id={pair.card1} onClick={input.onCardSelected}>{pair.card1}</td>
              <td id={pair.card2} onClick={input.onCardSelected}>{pair.card2}</td>
              <td>{pair.win_percent.toFixed(0)}%</td>
              <td>{pair.count}</td>
              <td>{pair.synergy_score.toFixed(2)}x</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}
