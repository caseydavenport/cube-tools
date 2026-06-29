import React from 'react';
import { Button, TextInput, NumericInput, DateSelector } from "../components/Dropdown.js";
import { PillSearchInput } from "../components/PillSearchInput.js";

export function SelectorBar(input) {
  // Publish the bar's height so the in-page section nav can stick directly
  // below it (the bar is sticky and its height changes as filter pills wrap).
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--selectorbar-height', el.offsetHeight + 'px');
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="selectorbar" ref={ref}>
      <div className="selector-group">
        <Button text="Refresh" onClick={input.triggerRefresh} />
        <DateSelector label="From" id="from" value={input.startDate} onChange={input.onStartSelected} />
        <DateSelector label="To" id="to" value={input.endDate} onChange={input.onEndSelected} />
        <NumericInput label="Bucket size" value={input.bucketSize} onChange={input.onBucketsChanged} />
        <NumericInput label="Draft size" value={input.minDraftSize} onChange={input.onMinDraftSizeChanged} />
        <Overview decks={input.parsed.filteredDecks} />
      </div>

      <div className="search-group">
        <PillSearchInput
          label={`Global Deck Filter (${input.parsed.filteredDecks?.length || 0} decks)`}
          placeholder="Filter decks (e.g. arch:aggro, player:casey, name:firebolt)"
          value={input.matchStr}
          cardNames={input.cardNames}
          playerNames={input.playerNames}
          archetypes={input.archetypes}
          onChange={input.onMatchUpdated}
        />
      </div>
    </div>
  );
}

export function Overview(input) {
  if (input.decks == null) return null;
  let numDecks = input.decks.length;
  let drafts = new Map();
  let players = new Map();
  for (let deck of input.decks) {
    drafts.set(deck.metadata.draft_id, true);
    players.set(deck.player, true);
  }
  let numDrafts = drafts.size;
  let numPlayers = players.size;
  return (
    <label className="dropdown">
      <label>Displaying stats for {numDrafts} drafts, {numDecks} decks, {numPlayers} players</label>
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
