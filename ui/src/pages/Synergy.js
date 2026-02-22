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
      <div className="synergy-grid" style={{"marginTop": "1rem", "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "2rem"}}>
        <SynergyWidgetTable {...input} />
        <FocalPointsTable {...input} />
      </div>
    </div>
  );
}

function OptionTooltip({ id, header, tip, children }) {
  return (
    <OverlayTrigger placement="bottom" delay={{ show: 100, hide: 100 }} overlay={
      <Popover id={id}><Popover.Header as="h3">{header}</Popover.Header><Popover.Body>{tip}</Popover.Body></Popover>
    }>
      <div>{children}</div>
    </OverlayTrigger>
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
        <OptionTooltip id="tip-min-decks" header="Min Decks" tip="Minimum co-occurrences to include a pair.">
          <NumericInput
            label="Min decks"
            value={input.minSynergyDecks}
            onChange={input.onMinSynergyDecksChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-focal" header="Focal Threshold" tip="Min synergy score for a partner to count toward focal score.">
          <NumericInput
            label="Focal threshold"
            value={input.focalThreshold}
            onChange={input.onFocalThresholdChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-smoothing" header="Smoothing K" tip="Dampens noisy scores from low-sample pairs. Higher K = more conservative. 0 = no smoothing.">
          <NumericInput
            label="Smoothing K"
            value={input.smoothingK}
            onChange={input.onSmoothingKChanged}
          />
        </OptionTooltip>
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
    { id: "synergy", text: "Syn", tip: "Lift score. >1 = appears together more than expected." },
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

function FocalPointsTable(input) {
  let stats = input.synergyData.focal_stats || []
  let headers = [
    { id: "card_name", text: "Card", tip: "Card Name" },
    { id: "focal_score", text: "Score", tip: "Sum of synergy scores for partners above the focal threshold. High = build-around card." },
    { id: "partners", text: "Top Partners", tip: "Cards that most frequently appear with this card." },
  ]

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr><td colSpan="3" className="header-cell" style={{"textAlign": "center", "fontWeight": "bold", "background": "var(--primary)", "color": "var(--page-background)"}}>Archetype Focal Points</td></tr>
          <tr>
            {headers.map((hdr, i) => (
              <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }} overlay={<Popover id="popover-basic"><Popover.Header as="h3">{hdr.text}</Popover.Header><Popover.Body>{hdr.tip}</Popover.Body></Popover>}>
                <td className="header-cell">{hdr.text}</td>
              </OverlayTrigger>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((stat, i) => (
            <tr className="widget-table-row" sort={stat.focal_score} key={i}>
              <td onClick={input.onCardSelected} id={stat.card_name}>{stat.card_name}</td>
              <td>{stat.focal_score.toFixed(2)}</td>
              <td style={{"fontSize": "0.85em", "color": "var(--text-muted)"}}>{stat.top_partners.join(", ")}</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}
