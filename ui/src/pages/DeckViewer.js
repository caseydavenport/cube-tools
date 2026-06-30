import React, { useState, useEffect, useMemo } from 'react'
import { LoadCube, LoadDecks, FetchNotes, SaveNotes, SaveDeckMeta } from "../utils/Fetch.js"
import { useCube } from "../contexts/CubeContext.js"
import { Record, MatchRecord, Wins, Losses, Draws, MatchWins, MatchLosses, MatchDraws, InDeckColor } from "../utils/Deck.js"
import { RemovalMatches, CounterspellMatches } from "../pages/Decks.js"
import { SortFunc, StringToColor, CheckboxesToColors, IsBasicLand } from "../utils/Utils.js"
import { CardMatches, DeckMatches } from "../utils/Query.js"
import { ColorImages } from "../utils/Colors.js"
import { Button, TextInput, DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { TagEditor } from "../components/TagEditor.js"
import { InitialDates } from "../components/StatsUI.js"
import { ColorPickerHeader } from "./Types.js"
import ReactMarkdown from "react-markdown";
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import { BrowseLayout, BrowseEmptyState } from "../components/BrowseLayout.js"
import { useSelection } from "../hooks/useSelection.js"


// This function builds the DeckViewer widget for selecting and viewing statistics
// about a particular deck.
export function DeckViewer(props) {
  const cube = useCube();

  ///////////////////////////////////////////////////////////////////////////////
  // State used for time selection.
  ///////////////////////////////////////////////////////////////////////////////
  let startDate = props.startDate
  let endDate = props.endDate

  // For matching decks and cards.
  const [typingStr, setTypingStr] = useState(props.matchStr || "");
  const [debouncedMatchStr, setDebouncedMatchStr] = useState(props.matchStr || "");

  // Update the debounced string after a delay.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMatchStr(typingStr);
      if (props.onMatchUpdated) {
        props.onMatchUpdated({ target: { value: typingStr } });
      }
    }, 300); // 300ms debounce delay
    return () => clearTimeout(timer);
  }, [typingStr]);

  // We keep two sets of variables - one for the dropdown values,
  // and another for the actual deck we want to display.
  // The dropdown values are just for filtering the deck list.
  const [selectedPlayer, setSelectedPlayer] = useState("");
  // The highlighted deck path is the source of truth for the selected deck and
  // is mirrored to the URL (?deck=<path>) so the selection is linkable.
  const [highlightedDeck, setHighlightedDeck] = useSelection("deck");
  const [selectedDraft, setSelectedDraft] = useState("");
  const [draftDropdown, setDraftDropdown] = useState("");

  // Track comparison decks. If any of these are set, we'll show a comparison view.
  const [comparisonDecks, setComparisonDecks] = useState(new Map());

  // The cache of loaded deck.
  const [fetched, setFetched] = useState(new Map());

  // The deck currently being displayed.
  const [deck, setDeck] = useState("");

  // Options for the draft dropdown.
  const [draftDropdownOptions, setDraftDropdownOptions] = useState([]);

  // Dropdown for mainboard vs. sideboard.
  const [mainboardSideboard, setMainboardSideboard] = useState("Mainboard");

  // View mode: Text or Images.
  const [viewMode, setViewMode] = useState("Text");

  // What to sort the deck list by.
  const sortOptions = [
    "Date", "Wins"
  ]
  const [deckSort, setDeckSort] = useState("date");
  function onDeckSort(event) {
    setDeckSort(event.currentTarget.id)
  }

  // Store all decks.
  const [decks, setDecks] = useState([]);
  function onDecksLoaded(d) {
    setDecks([...d])

    // Populate the draft dropdown options with all drafts.
    const draftOpts = [{ label: "", value: "" }]
    let seenDrafts = new Map()
    for (let deck of d) {
      if (!seenDrafts.has(deck.metadata.draft_id)) {
        draftOpts.push({ label: deck.metadata.draft_id, value: deck.metadata.draft_id})
        seenDrafts.set(deck.metadata.draft_id, true)
      }
    }
    setDraftDropdownOptions(draftOpts)
  }

  // Merge a server-updated deck back into both the list and the selected deck.
  function onDeckUpdated(updated) {
    const match = (d) =>
      d.player === updated.player &&
      d.metadata && d.metadata.draft_id === updated.metadata.draft_id
    // Replace the one deck that matches with the updated version, leave every other deck as-is.
    setDecks((prev) => prev.map((d) => (match(d) ? updated : d)))
    setDeck((prev) => (prev && match(prev) ? updated : prev))
  }

  function onDeckClicked(event) {
    // The ID is assigned to each deck on load.
    // <draft>/<player>/<id>

    // Parse the draft and deck, and update the dropdowns.
    let splits = event.currentTarget.id.split("/")
    setSelectedDraft(splits[0])
    setSelectedPlayer(splits[1])

    // Highlight the deck in the side bar.
    setHighlightedDeck(event.currentTarget.id)

    // If control is held, add this deck to the comparison set. Otherwise,
    // clear out the comparison set and just show this deck.
    if (event.ctrlKey || event.metaKey) {
      // Find the deck in the list of decks.
      for (let deck of decks) {
        if (deck.metadata.path == event.currentTarget.id) {
          // Add to the comparison set.
          let newComparisonDecks = new Map(comparisonDecks)
          if (newComparisonDecks.has(event.currentTarget.id)) {
            // Deck is already in the comparison set - remove it.
            newComparisonDecks.delete(event.currentTarget.id)
          } else {
            newComparisonDecks.set(event.currentTarget.id, deck)
          }
          setComparisonDecks(newComparisonDecks)
        }
      }
    } else {
      // Clear out the comparison set and just show this deck.
      setComparisonDecks(new Map())
    }
  }

  // Selected description.
  const [description, setDescription] = useState("");
  function onDescriptionFetched(f) {
    setDescription(f)
  }

  const [cubeData, setCubeData] = useState({ "cards": [] });

  // Start of day load the draft index.
  // This is used to populate the drafts dropdown menu.
  useEffect(() => {
    LoadDecks(cube, onDecksLoaded, startDate, endDate, 0, "", debouncedMatchStr, mainboardSideboard)
    LoadCube(cube, setCubeData)
  }, [startDate, endDate, debouncedMatchStr, mainboardSideboard]);

  // Handle changes to the draft and deck selection dropdowns.
  function onDeckSelected(event) {
    setSelectedPlayer(event.target.value)
  }
  function onDraftSelected(event) {
    // Set the selected draft, and update the list of decks.
    setDraftDropdown(event.target.value)
    setSelectedDraft(event.target.value)

    // Clear out the selected deck if a new draft is picked.
    setSelectedPlayer("")
  }
  function onBoardSelected(event) {
    setMainboardSideboard(event.target.value)
  }
  let boardOptions = [
    { label: "Mainboard", value: "Mainboard" },
    { label: "Sideboard", value: "Sideboard" },
    { label: "Pool", value: "Pool" },
  ]

  // Callback for sucessfully fetching a Deck.
  // This function updates the UI with the deck's contents.
  function onFetch(d) {
    const newDeck = {...d}
    setDeck(newDeck);

    // Update cache.
    fetched.set(selectedPlayer, newDeck)
    setFetched(new Map(fetched))
  }

  // Whenever the selected deck (highlightedDeck path) changes, resolve it to a
  // loaded deck. highlightedDeck may arrive from the URL on page load, so we
  // key off it directly and derive draft/player from the matched deck rather
  // than requiring the dropdowns to be set first.
  useEffect(() => {
    if (!highlightedDeck) {
      setDeck({})
      return
    }

    for (let deck of decks) {
      if (deck.metadata.path == highlightedDeck) {
        setDeck(deck)
        setSelectedDraft(deck.metadata.draft_id)
        setSelectedPlayer(deck.player)

        // The highlighted deck is always a comparison deck.
        let newComparisonDecks = new Map(comparisonDecks)
        newComparisonDecks.set(deck.metadata.path, deck)
        setComparisonDecks(newComparisonDecks)

        // Load the deck description, if it exists.
        let f = `data/${cube}/${deck.metadata.draft_id}/${deck.player}.report.md`
        FetchNotes(cube, f.toLowerCase(), onDescriptionFetched)
        return
      }
    }
  }, [highlightedDeck, decks])

  // We want to highlight any selected / comparison decks.
  let highlightedDecks = new Array()
  if (highlightedDeck) {
    highlightedDecks.push(highlightedDeck)
  }
  for (let deckPath of comparisonDecks.keys()) {
    highlightedDecks.push(deckPath)
  }

  // Memoize filtered and sorted decks to reduce lag during typing/filtering.
  const filteredAndSortedDecks = React.useMemo(() => {
    let filtered = [];
    let draftToColor = new Map();
    let grayscaleColors = ["#0f172a", "#1e293b"];
    let colorIdx = 0;

    for (let d of decks) {
      if (draftDropdown !== "" && draftDropdown !== d.date) continue;

      if (!draftToColor.has(d.metadata.draft_id)) {
        draftToColor.set(d.metadata.draft_id, grayscaleColors[colorIdx % grayscaleColors.length]);
        colorIdx++;
      }

      filtered.push(d);
    }

    filtered.sort((a, b) => {
      let sortA, sortB;
      switch (deckSort) {
        case "wins":
          sortA = deckSortWins(a);
          sortB = deckSortWins(b);
          break;
        case "player":
          sortA = a.player;
          sortB = b.player;
          break;
        case "macro":
          sortA = getMacro(a);
          sortB = getMacro(b);
          break;
        case "oppwin":
          sortA = a.opponent_win_percentage;
          sortB = b.opponent_win_percentage;
          break;
        default:
          sortA = a.date + a.metadata.draft_id;
          sortB = b.date + b.metadata.draft_id;
      }
      if (sortA > sortB) return -1;
      if (sortA < sortB) return 1;
      return 0;
    });

    return { decks: filtered, colors: draftToColor };
  }, [decks, draftDropdown, debouncedMatchStr, mainboardSideboard, deckSort]);

  const playerNames = useMemo(() => {
    let seen = new Set();
    for (let deck of decks) {
      if (deck.player) seen.add(deck.player);
    }
    return Array.from(seen).sort();
  }, [decks]);

  const eventIDs = useMemo(() => {
    let seen = new Set();
    for (let deck of decks) {
      const eid = deck.metadata && deck.metadata.draft_id;
      if (eid) seen.add(eid);
    }
    return Array.from(seen).sort();
  }, [decks]);

  const archetypes = useMemo(() => {
    let seen = new Set();
    for (let deck of decks) {
      if (deck.macro_archetype) {
        seen.add(deck.macro_archetype);
      }
      if (deck.labels) {
        for (let label of deck.labels) {
          seen.add(label);
        }
      }
    }
    return Array.from(seen).sort();
  }, [decks]);

  const filterBar = (
    <>
      <div className="selector-group">
        <DropdownHeader
          label="Draft"
          options={draftDropdownOptions}
          value={selectedDraft}
          onChange={onDraftSelected}
        />
        <DateSelector label="From" id="from" value={startDate} onChange={props.onStartSelected} />
        <DateSelector label="To" id="to" value={endDate} onChange={props.onEndSelected} />
        <DropdownHeader
          label="Board"
          options={boardOptions}
          value={mainboardSideboard}
          onChange={onBoardSelected}
        />
        <DropdownHeader
          label="View"
          options={[
            { label: "Text", value: "Text" },
            { label: "Images", value: "Images" },
          ]}
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
        />
      </div>
      <div className="search-group">
        <PillSearchInput
          label={`Global Deck Filter (${filteredAndSortedDecks.decks.length} decks)`}
          placeholder="Search cards (e.g. color:ug, cmc<3, t:creature)"
          value={typingStr}
          cardNames={cubeData.cards.map(c => c.name)}
          playerNames={playerNames}
          archetypes={archetypes}
          eventIDs={eventIDs}
          onChange={(e) => setTypingStr(e.target.value)}
        />
      </div>
    </>
  );

  const hasDeck = deck && deck.metadata;

  return (
    <BrowseLayout
      filters={filterBar}
      index={
        <FilteredDecks
          decks={filteredAndSortedDecks.decks}
          draftToColor={filteredAndSortedDecks.colors}
          highlight={highlightedDecks}
          onDeckClicked={onDeckClicked}
          onSortHeader={onDeckSort}
          isFiltered={debouncedMatchStr !== "" || draftDropdown !== ""}
        />
      }
      detail={
        hasDeck ? (
          <MainDisplay
            cube={cube}
            deck={deck}
            decks={decks}
            comparisonDecks={comparisonDecks}
            mbsb={mainboardSideboard}
            matchStr={debouncedMatchStr}
            description={description}
            onDescriptionFetched={onDescriptionFetched}
            viewMode={viewMode}
            archetypes={archetypes}
            onDeckUpdated={onDeckUpdated}
          />
        ) : (
          <BrowseEmptyState message="Select a deck to view its decklist." />
        )
      }
    />
  );
}

function getMacro(deck) {
  const m = (deck.macro_archetype || "").toLowerCase()
  switch (m) {
    case "aggro": return "Aggro"
    case "midrange": return "Midrange"
    case "control": return "Control"
    default: return "N/A"
  }
}

// DropdownSelector is a dropdown selector that sits right below the main navbar.
export function DropdownSelector({ label, value, options, onChange }) {
  return (
   <label className="dropdown">
    {label}
     <select className="select" value={value} onChange={onChange}>
       {
         options.map((option) => (
           <option key={option.label} className="select-option" file={option.value}>{option.value}</option>
         ))
       }
     </select>
   </label>
  )
}

function FilteredDecks(input) {
  const decks = input.decks;
  const draftToColor = input.draftToColor;

  let totalMatchWins = 0;
  let totalMatchLosses = 0;
  let totalMatchDraws = 0;
  let totalGameWins = 0;
  let totalGameLosses = 0;

  for (let deck of decks) {
    totalMatchWins += MatchWins(deck);
    totalMatchLosses += MatchLosses(deck);
    totalMatchDraws += MatchDraws(deck);
    totalGameWins += Wins(deck);
    totalGameLosses += Losses(deck);
  }

  let totalGames = totalGameWins + totalGameLosses;
  let aggregateWinPercent = totalGames > 0 ? Math.round(100 * totalGameWins / totalGames) : 0;
  let aggregateRecord = totalMatchWins + "-" + totalMatchLosses + (totalMatchDraws > 0 ? "-" + totalMatchDraws : "");

  let title = decks.length + " Decks";
  if (input.isFiltered) {
    title = decks.length + " Decks | " + aggregateRecord + " (" + aggregateWinPercent + "%)";
  }

  return (
    <div className="filtered-decks">
      <table className="widget-table" style={{"border": "none", "borderRadius": "0"}}>
        <thead className="table-header">
          <tr>
            <td colSpan="4" id="decklist-title" className="header-cell" style={{"textAlign": "center", "background": "var(--primary)", "color": "var(--page-background)"}}>{title}</td>
          </tr>
          <tr>
            <td style={{"width": "25%", "paddingLeft": "10px"}} onClick={input.onSortHeader} id="date" className="header-cell">Date</td>
            <td style={{"width": "25%", "paddingLeft": "0px"}} onClick={input.onSortHeader} id="player" className="header-cell">Player</td>
            <td style={{"width": "25%", "paddingLeft": "0px"}} onClick={input.onSortHeader} id="wins" className="header-cell">Record</td>
            <td style={{"width": "25%", "paddingLeft": "0px"}} onClick={input.onSortHeader} id="macro" className="header-cell">Macro</td>
          </tr>
        </thead>
        <tbody>
          {
            decks.map(function(deck, idx) {
              let color = draftToColor.get(deck.metadata.draft_id)
              let className = "widget-table-row"

              if (input.highlight.includes(deck.metadata.path)) {
                className += " button-selected"
              }

              let record = MatchWins(deck) + "-" + MatchLosses(deck) + "-" + MatchDraws(deck)
              if (MatchWins(deck) == 0 && MatchLosses(deck) == 0 && MatchDraws(deck) == 0) {
                record = "N/A"
              }
              let winPercent = Math.round(100 * gameWinPercent(deck))
              let macro = getMacro(deck)

              return (
                <tr className={className} key={idx} style={{"--background-color": color}} onClick={input.onDeckClicked} id={deck.metadata.path}>
                  <td style={{"width": "25%", "paddingLeft": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="date">{deck.date}</td>
                  <td style={{"width": "30%", "paddingRight": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="player">{deck.player}</td>
                  <td style={{"width": "25%", "paddingLeft": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="wins">{record} ({winPercent}%)</td>
                  <td style={{"width": "20%", "paddingRight": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="macro">{macro}</td>
                </tr>
              )
            })
          }
        </tbody>
      </table>
    </div>
  );
}

function deckSortWins(deck) {
  // Primary sort by number of match wins, secondary by game win percentage.
  let gameWin = gameWinPercent(deck)
  let sort = MatchWins(deck) + gameWin

  // If there are any matches at all, rank this deck first.
  if (MatchWins(deck) || MatchLosses(deck)) {
    sort += 100
  }

  // If the deck has no matches and no games, just put it at the bottom.
  if (!MatchWins(deck) && !MatchLosses(deck) && !Wins(deck) && !Losses(deck)) {
    sort = -1
  }
  return sort
}

function gameWinPercent(deck) {
  let wins = Wins(deck)
  let losses = Losses(deck)
  return wins / (wins + losses) || 0
}


function DeckTableCell(input) {
  let deck = input.deck
  let record = MatchWins(input.deck) + "-" + MatchLosses(input.deck) + "-" + MatchDraws(input.deck)
  if (MatchWins(deck) == 0 && MatchLosses(deck) == 0 && MatchDraws(deck) == 0) {
    record = "N/A"
  }
  let winPercent = Math.round(100 * gameWinPercent(input.deck))
  let macro = getMacro(input.deck)
  return (
      <table className="deck-meta-table">
      <tbody>
        <tr className="deck-entry" style={{"--background-color": input.color}}>
          <td style={{"width": "25%", "paddingLeft": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="date">{deck.date}</td>
          <td style={{"width": "30%", "paddingRight": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="player">{deck.player}</td>
          <td style={{"width": "25%", "paddingLeft": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="wins">{record} ({winPercent}%)</td>
          <td style={{"width": "20%", "paddingRight": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="macro">{macro}</td>
        </tr>
      </tbody>
      </table>
  );
}


// MainDisplay prints out the given deck.
function MainDisplay(input) {
  if (input.comparisonDecks && input.comparisonDecks.size > 1) {
    return compareDecks(input);
  }
  if (input.viewMode === "Images") {
    return displayDeckImages(input);
  }
  return displayDeck(input);
}

function compareDecks(input) {
  // Build a set of cards that are common across all input decks.
  let allCards = new Map()
  for (let deck of input.comparisonDecks.values()) {
    let cards = deck.mainboard
    if (input.mbsb == "Sideboard") {
      cards = deck.sideboard
    }
    if (input.mbsb == "Pool") {
      cards = deck.pool
    }

    for (let card of cards) {
      // If the card is already in the map, increment the count.
      if (allCards.has(card.name)) {
        // Add this deck.
        let entry = allCards.get(card.name)
        entry.decks.set(deck.metadata.path, true)
        allCards.set(card.name, entry)
      } else {
        // New card - add it to the map.
        allCards.set(card.name, { card: card, decks: new Map([[deck.metadata.path, true]])})
      }
    }
  }

  // Build a list of cards that are in all decks.
  let allCardsList = new Array()
  for (let entry of allCards.values()) {
    if (entry.decks.size == input.comparisonDecks.size) {
      allCardsList.push(entry.card)
    }
  }

  let player = "Multiple Players"

  return (
    <div className="deck-view">
      <div className="flexhouse">
        <CardList player={player} cards={allCardsList} sb={input.mbsb == "Sideboard"} opts={{cmc: 0}} matchStr={input.matchStr} />
        <CardList player={player} cards={allCardsList} sb={input.mbsb == "Sideboard"} opts={{cmc: 1}} matchStr={input.matchStr} />
        <CardList player={player} cards={allCardsList} sb={input.mbsb == "Sideboard"} opts={{cmc: 2}} matchStr={input.matchStr} />
        <CardList player={player} cards={allCardsList} sb={input.mbsb == "Sideboard"} opts={{cmc: 3}} matchStr={input.matchStr} />
        <CardList player={player} cards={allCardsList} sb={input.mbsb == "Sideboard"} opts={{cmc: 4}} matchStr={input.matchStr} />
        <CardList player={player} cards={allCardsList} sb={input.mbsb == "Sideboard"} opts={{cmc: 5, gt: true}} matchStr={input.matchStr} />
      </div>
    </div>
  );
}

function displayDeckImages(input) {
  let deck = input.deck

  let missing = (input.mbsb == "Mainboard" && !deck.mainboard)
  missing = missing || (input.mbsb == "Sideboard" && !deck.sideboard)
  missing = missing || (input.mbsb == "Pool" && !deck.pool)
  if (!deck || missing) {
    return null;
  }

  let cards = deck.mainboard
  if (input.mbsb == "Sideboard") {
    cards = deck.sideboard
  }
  if (input.mbsb == "Pool") {
    cards = deck.pool
  }

  let cardMap = new Map();
  for (let card of deck.mainboard) {
    cardMap.set(card.name, card)
  }
  for (let card of deck.sideboard) {
    cardMap.set(card.name, card)
  }

  return (
    <div className="deck-view">
      <PlayerFrame {...input} />
      <div className="deck-images-columns">
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 0}} matchStr={input.matchStr} />
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 1}} matchStr={input.matchStr} />
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 2}} matchStr={input.matchStr} />
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 3}} matchStr={input.matchStr} />
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 4}} matchStr={input.matchStr} />
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 5, gt: true}} matchStr={input.matchStr} />
        <CardImagesList cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} matchStr={input.matchStr} basicsOnly={true} />
      </div>
      <DeckReport cube={input.cube} player={deck.player} cardMap={cardMap} description={input.description} onDescriptionFetched={input.onDescriptionFetched} deck={deck} />
    </div>
  );
}

function CardImagesList({cards, deck, sb, opts, matchStr, basicsOnly}) {
  let toDisplay = new Array()
  for (let card of cards) {
    const isBasic = IsBasicLand(card)
    if (basicsOnly) {
      if (isBasic) {
        toDisplay.push(card)
      }
      continue
    }

    // Skip basic lands for normal CMC sections.
    if (isBasic) {
      continue
    }

    if (opts.gt && card.cmc >= opts.cmc || card.cmc === opts.cmc) {
      toDisplay.push(card)
    }
  }

  if (toDisplay.length === 0) {
    return null
  }

  // Sort toDisplay by type then name.
  toDisplay.sort((a, b) => {
    let typeA = getType(a)
    let typeB = getType(b)
    if (typeA < typeB) return -1
    if (typeA > typeB) return 1
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })

  let title = "CMC=" + opts?.cmc
  if (opts?.gt) title = "CMC=" + opts.cmc + "+"
  if (basicsOnly) title = "Basics"

  // Split into chunks of 10 for wrapping.
  const chunks = [];
  for (let i = 0; i < toDisplay.length; i += 10) {
    chunks.push(toDisplay.slice(i, i + 10));
  }

  return (
    <div className="deck-images-group">
      <div className="table-header" style={{"padding": "0.5rem 1rem", "borderRadius": "8px 8px 0 0", "marginBottom": "0.5rem", "textAlign": "center"}}>
        {title} ({toDisplay.length})
      </div>
      <div className="card-stacks-container">
        {chunks.map((chunk, chunkIdx) => (
          <div className="card-stack" key={chunkIdx}>
            {
              chunk.map(function(card, idx) {
                let className = "cardimage"
                if (matchStr && CardMatches(card, matchStr, true)) {
                  className += " button-selected"
                } else if (sb && InDeckColor(card, deck)) {
                  className += " card-playable-highlight"
                }

                return (
                  <div key={card.name + idx} className="card-stack-item">
                    <OverlayTrigger
                      placement="top"
                      delay={{ show: 200, hide: 100 }}
                      overlay={
                        <Popover id="popover-basic" style={{maxWidth: 'none'}}>
                          <Popover.Body style={{padding: '0'}}>
                            <img
                              src={`https://api.scryfall.com/cards/named?format=image&exact=${encodeURIComponent(card.name)}`}
                              alt={card.name}
                              style={{width: '300px', display: 'block', borderRadius: '12px'}}
                            />
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <img
                        src={`https://api.scryfall.com/cards/named?format=image&exact=${encodeURIComponent(card.name)}`}
                        alt={card.name}
                        className={className}
                        style={{"width": "200px"}}
                      />
                    </OverlayTrigger>
                  </div>
                )
              })
            }
          </div>
        ))}
      </div>
    </div>
  )
}

function displayDeck(input) {
  let deck = input.deck

  // The deck mainboard may not always be set, so we need
  // to initialize to an empty slice.
  let missing = (input.mbsb == "Mainboard" && !deck.mainboard)
  missing = missing || (input.mbsb == "Sideboard" && !deck.sideboard)
  missing = missing || (input.mbsb == "Pool" && !deck.pool)
  if (!deck || missing) {
    return null;
  }

  let cards = deck.mainboard
  if (input.mbsb == "Sideboard") {
    cards = deck.sideboard
  }
  if (input.mbsb == "Pool") {
    cards = deck.pool
  }

  let cardMap = new Map();
  for (let card of deck.mainboard) {
    cardMap.set(card.name, card)
  }
  for (let card of deck.sideboard) {
    cardMap.set(card.name, card)
  }

  return (
    <div className="deck-view">
      <PlayerFrame {...input} />
      <div className="flexhouse">
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 0}} matchStr={input.matchStr} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 1}} matchStr={input.matchStr} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 2}} matchStr={input.matchStr} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 3}} matchStr={input.matchStr} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 4}} matchStr={input.matchStr} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 5, gt: true}} matchStr={input.matchStr} />
      </div>
      <DeckReport cube={input.cube} player={deck.player} cardMap={cardMap} description={input.description} onDescriptionFetched={input.onDescriptionFetched} deck={deck} />
    </div>
  );
}

function DeckReport(input) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(input.description);

  // Sync editContent when description changes from props.
  useEffect(() => {
    setEditContent(input.description);
  }, [input.description]);

  if (input.description == "" && !isEditing) {
    return (
      <div className="player-frame" style={{"marginTop": "2rem", "textAlign": "center"}}>
        <Button text="Add Notes" onClick={() => setIsEditing(true)} />
      </div>
    );
  }

  const onSave = async () => {
    try {
      let f = `data/${input.cube}/${input.deck.metadata.draft_id}/${input.deck.player}.report.md`
      await SaveNotes(input.cube, f.toLowerCase(), editContent);
      input.onDescriptionFetched(editContent);
      setIsEditing(false);
    } catch (err) {
      alert("Failed to save notes: " + err.message);
    }
  };

  // Replace [[cardname]] with links to the card.
  let description = input.description
  const match = /\[\[.*\]\]/g
  let replace = function(val) {
    // Determine the card name.
    let cardName = val.replace("[[", "").replace("]]", "")

    if (input.cardMap.has(cardName)) {
      return "**[" + cardName + "](" + input.cardMap.get(cardName).url + ")**"
    }

    // No match - return without the link.
    return cardName
  }
  description = description.replace(match, replace)

  return (
    <div className="player-frame" style={{"marginTop": "2rem"}}>
      <div className="player-frame-header" style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "1rem", "borderBottom": "1px solid var(--border)", "paddingBottom": "0.5rem"}}>
        <h2 style={{"margin": "0", "color": "var(--primary)"}}>Notes from the draft</h2>
        <div style={{"display": "flex", "gap": "0.5rem"}}>
          {isEditing ? (
            <>
              <Button text="Save" onClick={onSave} />
              <Button text="Cancel" onClick={() => { setIsEditing(false); setEditContent(input.description); }} />
            </>
          ) : (
            <Button text="Edit" onClick={() => setIsEditing(true)} />
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          style={{
            "width": "100%",
            "minHeight": "300px",
            "background": "var(--page-background)",
            "color": "var(--white)",
            "border": "1px solid var(--border)",
            "borderRadius": "8px",
            "padding": "1rem",
            "fontFamily": "inherit",
            "fontSize": "1rem"
          }}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
        />
      ) : (
        <ReactMarkdown>
          {description}
        </ReactMarkdown>
      )}
    </div>
  );
}

function PlayerFrame(input) {
  let deck = input.deck
  const cube = input.cube
  const onDeckUpdated = input.onDeckUpdated
  const [saveError, setSaveError] = useState(null)

  // Build the WUBRG checkbox array from the deck's effective colors.
  const colorBools = ["W", "U", "B", "R", "G"].map((c) => (deck.colors || []).includes(c))
  const hasOverride = !!(deck.colors_override && deck.colors_override.length)

  // Commit a change to one of the three editable fields. Omitting a field keeps
  // its current value; pass [] for colors to clear the override.
  const commit = async ({ macro, labels, colors }) => {
    setSaveError(null)
    try {
      const updated = await SaveDeckMeta(cube, {
        draft_id: deck.metadata.draft_id,
        player: deck.player,
        macro_archetype: macro !== undefined ? macro : (deck.macro_archetype || ""),
        labels: labels !== undefined ? labels : (deck.labels || []),
        colors: colors !== undefined ? colors : (deck.colors_override || []),
      })
      if (onDeckUpdated) onDeckUpdated(updated)
    } catch (e) {
      setSaveError("Failed to save")
    }
  }

  const onColorChecked = (e) => {
    const idx = ["W", "U", "B", "R", "G"].indexOf(e.target.id)
    if (idx < 0) return
    const next = colorBools.slice()
    next[idx] = !next[idx]
    commit({ colors: CheckboxesToColors(next) })
  }

  let cards = deck.mainboard
  if (input.mbsb == "Sideboard") {
    cards = deck.sideboard
  }
  if (input.mbsb == "Pool") {
    cards = deck.pool
  }

  // Get fields to display.
  let labels = (deck.labels || []).join(', ')
  let acmc = deck.avg_cmc
  let colors = ColorImages(deck.colors)
  let cardCount = cards.length

  // Count the number of different types of spells.
  let creatures = 0
  let interaction = 0
  for (let card of cards) {
    // Creature
    if (card.types.includes("Creature")) {
      creatures += 1
    }

    // Interaction - removal and counterspells.
    for (let match of RemovalMatches.concat(CounterspellMatches)) {
      if (card.oracle_text.toLowerCase().match(match)){
        interaction += 1
        break
      }
    }

    // If the card matches the string, we will highlight it.
    // (Mutation removed, highlighting handled in CardList)
  }

  const copyToClipboard = () => {
    let text = "";
    
    // Helper to format a list of cards
    const formatCards = (cardList) => {
      let counts = new Map();
      for (let card of cardList) {
        counts.set(card.name, (counts.get(card.name) || 0) + 1);
      }
      let result = "";
      for (let [name, count] of counts) {
        result += `${count}x ${name}\n`;
      }
      return result;
    };

    if (deck.mainboard) {
      text += formatCards(deck.mainboard);
    }

    navigator.clipboard.writeText(text).then(() => {
      alert("Deck copied to clipboard!");
    }).catch(err => {
      console.error("Failed to copy deck: ", err);
    });
  };

  return (
    <div className="player-frame">
      <div className="player-frame-header" style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "1rem", "borderBottom": "1px solid var(--border)", "paddingBottom": "0.5rem"}}>
        <div style={{"display": "flex", "alignItems": "center", "gap": "1rem"}}>
          <h2 style={{"margin": "0", "color": "var(--primary)"}}>{deck.player}</h2>
          <Button text="Copy to Clipboard" onClick={copyToClipboard} />
        </div>
        <OverlayTrigger
          trigger="click"
          rootClose
          placement="bottom-end"
          overlay={
            <Popover id={`color-picker-${deck.player}`} style={{maxWidth: "none"}}>
              <Popover.Body style={{padding: "0.25rem"}}>
                <ColorPickerHeader display={colorBools} onChecked={onColorChecked} />
                {!hasOverride && <div style={{"textAlign": "center", "fontSize": "0.8rem", "opacity": "0.7"}}>(inferred)</div>}
                {saveError && <div style={{"textAlign": "center", "color": "var(--danger, red)", "fontSize": "0.8rem"}}>{saveError}</div>}
              </Popover.Body>
            </Popover>
          }
        >
          <div style={{"fontSize": "1.2rem", "cursor": "pointer", "display": "flex", "alignItems": "center", "gap": "0.25rem"}} title="Edit colors">
            {colors}
            <span style={{"fontSize": "0.7rem", "opacity": "0.6"}}>▾</span>
          </div>
        </OverlayTrigger>
      </div>

      <div className="stats-grid" style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit, minmax(200px, 1fr))", "gap": "1rem"}}>
        <div className="stat-item">
          <span className="player-frame-title">Record:</span>
          <span className="player-frame-value">{MatchWins(deck)}-{MatchLosses(deck)} ({Wins(deck)}-{Losses(deck)})</span>
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Archetype:</span>
          <DropdownHeader
            value={deck.macro_archetype || ""}
            options={[
              { label: "—", value: "" },
              { label: "Aggro", value: "aggro" },
              { label: "Midrange", value: "midrange" },
              { label: "Control", value: "control" },
            ]}
            onChange={(e) => commit({ macro: e.target.value })}
          />
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Tags:</span>
          <TagEditor
            tags={deck.labels || []}
            suggestions={input.archetypes || []}
            onChange={(next) => commit({ labels: next })}
          />
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Event:</span>
          <span className="player-frame-value">{(deck.metadata && deck.metadata.draft_id) || "—"}</span>
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Avg CMC:</span>
          <span className="player-frame-value">{acmc || "N/A"}</span>
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Cards:</span>
          <span className="player-frame-value">{cardCount} ({creatures} Creatures, {interaction} Interaction)</span>
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Opp. Win %:</span>
          <span className="player-frame-value">{deck.opponent_win_percentage}%</span>
        </div>
      </div>

      {deck.matches.length > 0 && (
        <div className="matches-section" style={{"marginTop": "1.5rem"}}>
          <h4 style={{"marginBottom": "0.5rem", "fontSize": "1rem", "color": "var(--text-muted)", "textTransform": "uppercase"}}>Match Details</h4>
          <div className="matches-grid" style={{"display": "flex", "flexWrap": "wrap", "gap": "0.5rem"}}>
            {[...deck.matches].sort((a, b) => (a.round || Infinity) - (b.round || Infinity)).map(function(match, i) {
              let result = "W"
              if (match.wins == match.losses) {
                result = "D"
              } else if (match.winner && deck.player.toLowerCase() != match.winner.toLowerCase()) {
                result = "L"
              } else if (!match.winner && match.losses > match.wins) {
                result = "L"
              }

              let oppLabel = match.opponent || "Unknown"
              let oppArch = ""
              if (match.opponent) {
                for (let d of input.decks) {
                  if (d.player.toLowerCase() == match.opponent.toLowerCase() && d.date == deck.date) {
                    oppArch = getMacro(d)
                    break
                  }
                }
              }

              // Use explicit match scores if available, otherwise fall back to games lookup.
              let score = MatchRecord(match)
              if (match.wins === 0 && match.losses === 0 && match.draws === 0) {
                score = Record(deck, match.opponent)
              }

              return (
                <div key={i} className="match-pill" style={{"background": "var(--table-header-background)", "padding": "0.4rem 0.8rem", "borderRadius": "20px", "fontSize": "0.85rem", "border": "1px solid var(--border)"}}>
                  {match.round > 0 && <span style={{"opacity": "0.6", "marginRight": "0.5rem"}}>R{match.round}</span>}
                  <span style={{"fontWeight": "bold", "marginRight": "0.5rem", "fontStyle": match.opponent ? "normal" : "italic", "opacity": match.opponent ? 1 : 0.7}}>{oppLabel}:</span>
                  <span style={{"color": result === "W" ? "var(--success)" : result === "L" ? "var(--danger)" : "var(--white)"}}>{result}</span>
                  <span style={{"marginLeft": "0.5rem", "opacity": "0.7"}}>({score}){oppArch && ` | ${oppArch}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CardList({player, cards, deck, sb, opts, matchStr, basicsOnly}) {
  if (basicsOnly) return null; // Basics only section removed from text view.

  // Group all cards by name and count occurrences within the current CMC section.
  let grouped = new Map()
  let totalCount = 0

  for (let card of cards) {
    // Logic for CMC grouping.
    if (!(opts.gt && card.cmc >= opts.cmc || card.cmc === opts.cmc)) {
      continue
    }

    if (grouped.has(card.name)) {
      grouped.get(card.name).count += 1
    } else {
      grouped.set(card.name, { card: card, count: 1 })
    }
    totalCount += 1
  }

  if (grouped.size === 0) {
    return null
  }

  let toDisplay = Array.from(grouped.values())

  // Sort toDisplay by type then name.
  toDisplay.sort((a, b) => {
    let typeA = getType(a.card)
    let typeB = getType(b.card)
    if (typeA < typeB) return -1
    if (typeA > typeB) return 1
    if (a.card.name < b.card.name) return -1
    if (a.card.name > b.card.name) return 1
    return 0
  })

  let title = "CMC=" + opts?.cmc + " (" + totalCount + " cards)"
  if (opts?.gt) {
    title = "CMC=" + opts.cmc + "+ (" + totalCount + " cards)"
  }

  let key = player + opts.cmc

  // Generate the key for this table.
  return (
    <div className="decklist-wrapper">
      <table key={key} className="decklist">
        <thead className="table-header">
          <tr>
            <td colSpan="3" className="header-cell">{title}</td>
          </tr>
        </thead>
        <tbody>
        {
          toDisplay.map(function(item, idx) {
            let card = item.card
            let key = card.name + idx
            let type = getType(card)
            let text = item.count > 1 ? `${item.count}x ${card.name}` : card.name
            let className = "widget-table-row"

            // Dynamic highlighting check
            if (matchStr && CardMatches(card, matchStr, true)) {
              className += " button-selected"
            } else if (sb && InDeckColor(card, deck)) {
              className += " card-playable-highlight"
            }

            let imgs = ColorImages(card.colors)
            return (
              <tr className={className} key={key} card={card}>
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{imgs}</a></td>
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{type}</a></td>
                <OverlayTrigger
                  placement="right"
                  delay={{ show: 200, hide: 100 }}
                  overlay={
                    <Popover id="popover-basic" style={{maxWidth: 'none'}}>
                      <Popover.Body style={{padding: '0'}}>
                        <img
                          src={`https://api.scryfall.com/cards/named?format=image&exact=${encodeURIComponent(card.name)}`}
                          alt={card.name}
                          style={{width: '250px', display: 'block', borderRadius: '12px'}}
                        />
                      </Popover.Body>
                    </Popover>
                  }
                >
                  <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{text}</a></td>
                </OverlayTrigger>
              </tr>
            )
          })
        }
        </tbody>
      </table>
    </div>
  );
}

// cardSort sorts cards by type, followed by card name.
function cardSort(a, b) {
  // Top level is sorted by card type.
  let typeA = getType(a.props.card)
  let typeB = getType(b.props.card)
  if (typeA == typeB) {
    // They are the same type. Compare based on name.
    if (a.props.card.name < b.props.card.name) {
      return -1
    } else {
     return 1
   }
  }

  // Cards are not the same type. Sort based on card type.
  if (typeA < typeB) {
    return -1
  } else if (typeA > typeB) {
    return 1
  }
  return 0
}

function getType(card) {
  if (card.types.includes("Creature")) {
    return "Creature"
  }
  if (card.types.includes("Planeswalker")) {
    return "Planeswalker"
  }
  return card.types[0]
}
