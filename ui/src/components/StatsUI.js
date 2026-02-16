import React from 'react';
import { Button, TextInput, NumericInput, DateSelector } from "../components/Dropdown.js";
import { QueryTerms } from "../utils/Query.js";

export function SelectorBar(input) {
  return (
    <table id="selectorbar" className="selectorbar">
      <tbody>
        <tr>
          <Button text="Refresh" onClick={input.triggerRefresh} />
          <DateSelector label="From: " id="from" value={input.startDate} onChange={input.onStartSelected} />
          <DateSelector label="To: " id="to" value={input.endDate} onChange={input.onEndSelected} />
          <NumericInput className="dropdown" label="Bucket size" value={input.bucketSize} onChange={input.onBucketsChanged} />
          <NumericInput className="dropdown" label="Draft size" value={input.minDraftSize} onChange={input.onMinDraftSizeChanged} />
          <TextInput className="dropdown" label="Player" value={input.playerMatch} onChange={input.onPlayerMatchChanged} />
          <TextInput className="dropdown" label="Search" placeholder={QueryTerms} big={true} value={input.matchStr} onChange={input.onMatchUpdated} />
        </tr>
        <tr>
          <Overview decks={input.parsed.filteredDecks} />
          <Button text="Colors" checked={input.display[0]} onClick={input.onColorPage} />
          <Button text="Types" checked={input.display[1]} onClick={input.onArchetypePage} />
          <Button text="Cards" checked={input.display[2]} onClick={input.onCardPage} />
          <Button text="Decks" checked={input.display[3]} onClick={input.onDeckPage} />
          <Button text="Drafts" checked={input.display[4]} onClick={input.onDraftPage} />
          <Button text="Players" checked={input.display[5]} onClick={input.onPlayersPage} />
          <Button text="Synergy" checked={input.display[6]} onClick={input.onSynergyPage} />
        </tr>
      </tbody>
    </table>
  );
}

export function Overview(input) {
  if (input.decks == null) return null;
  let numDecks = input.decks.length;
  let drafts = new Map();
  for (let deck of input.decks) {
    drafts.set(deck.metadata.draft_id, true);
  }
  let numDrafts = drafts.size;
  return (
    <label className="dropdown">
      <label>Displaying stats for {numDrafts} drafts, {numDecks} decks</label>
    </label>
  );
}

export function InitialDates() {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  let day = today.getDate();
  const end = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  const start = "1990-09-15";
  return [start, end];
}
