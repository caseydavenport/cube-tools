import React, { useRef } from 'react'
import { SortFunc } from "../utils/Utils.js"
import { DropdownHeader } from "../components/Dropdown.js"
import { Trophies } from "../utils/Deck.js"
import { CollapsibleIndex } from "../components/BrowseLayout.js"

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

function DraftPackWidgetOptions(input) {
  return (
    <div className="selector-group" style={{"justifyContent": "center"}}>
      {input.draftLogs.length > 1 && (
        <DropdownHeader
          label="Draft"
          options={input.draftLogs}
          value={input.selectedDraftLog}
          onChange={input.onDraftLogSelected}
        />
      )}

      <DropdownHeader
        label="Player"
        options={input.draftPlayers}
        value={input.selectedPlayer}
        onChange={input.onDraftPlayerSelected}
      />

      <DropdownHeader
        label="Pick #"
        options={input.draftPacks}
        value={input.selectedPack}
        onChange={input.onPackSelected}
      />
    </div>
  );
}


export function DraftPackWidget(input) {
  let draft = {users: []};
  for (var [idx, log] of Object.entries(input.drafts)) {
    if (log.date === input.selectedDraftLog) {
      draft = log;
      break;
    }
  }

  let player = null
  let pack = {booster: new Array()}
  let selectedCard = ""

  for (var [userID, user] of Object.entries(draft.users)) {
    if (user.userName == input.selectedPlayer) {
      player = user
      break
    }
  }
  if (player) {
    // Determine the pack. The dropdown starts from 1, but the array is zero-indexed.
    if (input.selectedPack > 0 && input.selectedPack <= player.picks.length) {
      pack = player.picks[input.selectedPack-1]
      // Determine which card this player picked from the pack.
      if (pack.pick.length > 0) {
        selectedCard = pack.booster[pack.pick[0]]
      }
    }
  }

  return (
    <div className="flexhouse" style={{"justifyContent": "center"}}>
      {
        pack.booster.map(function(cardID) {
          // Look up the card object based on the ID.
          let card = draft.carddata[cardID]
          if (!card) return null;
          let img = card.image_uris.en
          let className = "cardimage"
          let sort = "a"
          if (cardID === selectedCard) {
            className = "cardimage-selected"
            sort = "b"
          }
          return (
            <OverlayTrigger
              key={cardID}
              sort={sort}
              placement="top"
              delay={{ show: 200, hide: 100 }}
              overlay={
                <Popover id="popover-basic" style={{maxWidth: 'none'}}>
                  <Popover.Body style={{padding: '0'}}>
                    <img
                      src={img}
                      alt={card.name}
                      style={{width: '250px', display: 'block', borderRadius: '12px'}}
                    />
                  </Popover.Body>
                </Popover>
              }
            >
              <img src={img} className={className}/>
            </OverlayTrigger>
          )
        }).sort(SortFunc)
      }
    </div>
  );
}

// draftRows turns the drafts map into sortable index rows: date, non-bot
// player count, and the trophy winner (derived from decks of that date).
export function draftRows(drafts, decks) {
  // Map each draft date to its trophy winner, if any deck that date won one.
  let winnerByDate = new Map();
  for (let deck of decks) {
    if (Trophies(deck) > 0 && deck.date) {
      winnerByDate.set(deck.date, deck.player);
    }
  }

  let rows = [];
  for (let draft of Object.values(drafts || {})) {
    if (draft.type !== "Draft") continue;
    let players = 0;
    for (let user of Object.values(draft.users || {})) {
      if (!user.isBot) players += 1;
    }
    rows.push({
      date: draft.date,
      players,
      winner: winnerByDate.get(draft.date) || "—",
    });
  }
  // Most recent first.
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

// DraftIndex is the collapsible list of drafts. Picking a draft collapses it;
// the winner cell links to that player's page when onSelectWinner is provided.
export function DraftIndex({ drafts, decks, selected, onSelect, collapsed, onToggleCollapse, onSelectWinner }) {
  let rows = draftRows(drafts, decks);
  const selectedRowRef = useRef(null);
  return (
    <CollapsibleIndex
      title={rows.length + " Drafts"}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selectedRef={selectedRowRef}
    >
      <table className="widget-table" style={{ border: "none", borderRadius: "0" }}>
        <thead className="table-header">
          <tr>
            <td className="header-cell">Date</td>
            <td className="header-cell">Players</td>
            <td className="header-cell">Winner</td>
          </tr>
        </thead>
        <tbody>
          {rows.map(function (row) {
            let className = "widget-table-row";
            const isSelected = row.date === selected;
            if (isSelected) className += " button-selected";
            const canLink = onSelectWinner && row.winner !== "—";
            return (
              <tr ref={isSelected ? selectedRowRef : null} key={row.date} className={className} id={row.date} onClick={onSelect}>
                <td id={row.date} style={{ whiteSpace: "nowrap" }}>{row.date}</td>
                <td id={row.date}>{row.players}</td>
                <td
                  style={{ whiteSpace: "nowrap" }}
                  className={canLink ? "xlink" : undefined}
                  onClick={canLink ? (e) => { e.stopPropagation(); onSelectWinner(row.winner); } : undefined}
                >{row.winner}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </CollapsibleIndex>
  );
}

// DraftPackBrowser shows the packs of the selected draft: pick a player and a
// pick number to see that pack, with the player's selection highlighted.
export function DraftPackBrowser(input) {
  return (
    <div>
      {input.summary && (
        <div className="player-frame deck-summary">
          <div className="deck-summary-header">
            <div className="deck-summary-identity">
              <h2 className="deck-summary-name">{input.summary.date}</h2>
            </div>
          </div>
          <div className="deck-summary-metrics">
            <span className="metric"><strong>{input.summary.players}</strong> players</span>
            <span className="sep">·</span>
            <span className="metric">Winner <strong>{input.summary.winner}</strong></span>
          </div>
        </div>
      )}
      <DraftPackWidgetOptions {...input} />
      <div className="widget-scroll" style={{ marginTop: "1rem", padding: "1rem", background: "var(--card-background)" }}>
        <DraftPackWidget {...input} />
      </div>
    </div>
  );
}
