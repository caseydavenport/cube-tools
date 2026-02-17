import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadDecks, FetchFile } from "../utils/Fetch.js"
import { Record, Wins, Losses, Draws, MatchWins, MatchLosses, MatchDraws, InDeckColor } from "../utils/Deck.js"
import { RemovalMatches, CounterspellMatches } from "../pages/Decks.js"
import { SortFunc, StringToColor, CheckboxesToColors } from "../utils/Utils.js"
import { CardMatches, DeckMatches, QueryTerms } from "../utils/Query.js"
import { ColorImages } from "../utils/Colors.js"
import { Button, TextInput, DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { InitialDates } from "../components/StatsUI.js"
import { ColorPickerHeader } from "./Types.js"
import ReactMarkdown from "react-markdown";


// This function builds the DeckViewer widget for selecting and viewing statistics
// about a particular deck.
export function DeckViewer(props) {
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

  // Sync typingStr if props.matchStr changes from outside (e.g. navigation)
  useEffect(() => {
    if (props.matchStr !== typingStr) {
      setTypingStr(props.matchStr || "");
    }
  }, [props.matchStr]);

  // We keep two sets of variables - one for the dropdown values,
  // and another for the actual deck we want to display.
  // The dropdown values are just for filtering the deck list.
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [highlightedDeck, setHighlightedDeck] = useState("");
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


  // For filtering decks by color.
  const [colorCheckboxes, setColorCheckboxes] = useState([false, false, false, false, false]);
  function onColorChecked(event) {
    let updated = [...colorCheckboxes]
    switch (event.target.id) {
      case "W":
        updated[0] = !colorCheckboxes[0];
        break;
      case "U":
        updated[1] = !colorCheckboxes[1];
        break;
      case "B":
        updated[2] = !colorCheckboxes[2];
        break;
      case "R":
        updated[3] = !colorCheckboxes[3];
        break;
      case "G":
        updated[4] = !colorCheckboxes[4];
        break;
    }
    const newboxes = [...updated]
    setColorCheckboxes(newboxes)
  }

  // What to sort the deck list by.
  const sortOptions = [
    "Date", "Wins"
  ]
  const [deckSort, setDeckSort] = useState("date");
  function onDeckSort(event) {
    setDeckSort(event.target.id)
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

  function onDeckClicked(event) {
    // The ID is assigned to each deck on load.
    // <draft>/<player>/<id>

    // Parse the draft and deck, and update the dropdowns.
    let splits = event.target.id.split("/")
    setSelectedDraft(splits[0])
    setSelectedPlayer(splits[1])

    // Highlight the deck in the side bar.
    setHighlightedDeck(event.target.id)

    // If control is held, add this deck to the comparison set. Otherwise,
    // clear out the comparison set and just show this deck.
    if (event.ctrlKey || event.metaKey) {
      // Find the deck in the list of decks.
      for (let deck of decks) {
        if (deck.metadata.path == event.target.id) {
          // Add to the comparison set.
          let newComparisonDecks = new Map(comparisonDecks)
          if (newComparisonDecks.has(event.target.id)) {
            // Deck is already in the comparison set - remove it.
            newComparisonDecks.delete(event.target.id)
          } else {
            newComparisonDecks.set(event.target.id, deck)
          }
          setComparisonDecks(newComparisonDecks)
        }
      }
    } else {
      // Clear out the comparison set and just show this deck.
      setComparisonDecks(new Map())
    }
  }

  const [minCMC, setMinCMC] = useState(0);
  const [maxCMC, setMaxCMC] = useState(0);
  function onMinCMCUpdated(event) {
    setMinCMC(event.target.value)
  }
  function onMaxCMCUpdated(event) {
    setMaxCMC(event.target.value)
  }

  // Selected description.
  const [description, setDescription] = useState("");
  function onDescriptionFetched(f) {
    setDescription(f)
  }

  // Start of day load the draft index.
  // This is used to populate the drafts dropdown menu.
  useEffect(() => {
    LoadDecks(onDecksLoaded, startDate, endDate, 0, "")
  }, [startDate, endDate]);

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
    const newdeck = {...d}
    setDeck(newdeck);

    // Update cache.
    fetched.set(selectedPlayer, newdeck)
    setFetched(new Map(fetched))
  }

  // Whenever the selected deck is updated.
  useEffect(() => {
    if (!selectedPlayer || !selectedDraft) {
      // On page load, selected deck will be empty.
      setDeck({})
      return
    }


    // Find the deck and set the active deck.
    for (let deck of decks) {
      if (deck.metadata.path == highlightedDeck) {
        setDeck(deck)

        // The highlighted deck is always a comparison deck.
        let newComparisonDecks = new Map(comparisonDecks)
        newComparisonDecks.set(deck.metadata.path, deck)
        setComparisonDecks(newComparisonDecks)

        // Load the deck description, if it exists.
        let f = "data/polyverse/" + deck.metadata.draft_id + "/" + deck.player + ".report.md"
        FetchFile(f.toLowerCase(), onDescriptionFetched)
        return
      }
    }
  }, [highlightedDeck])

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
    let filterByColor = colorCheckboxes.some(e => e);

    for (let d of decks) {
      if (draftDropdown !== "" && draftDropdown !== d.date) continue;
      if (minCMC > 0 && d.avg_cmc < minCMC) continue;
      if (maxCMC > 0 && d.avg_cmc > maxCMC) continue;
      if (filterByColor) {
        let deckMatches = true;
        let enabledColors = CheckboxesToColors(colorCheckboxes);
        for (let color of enabledColors) {
          if (!d.colors.includes(color)) {
            deckMatches = false;
            break;
          }
        }
        if (!deckMatches) continue;
      }

      if (!draftToColor.has(d.metadata.draft_id)) {
        draftToColor.set(d.metadata.draft_id, grayscaleColors[colorIdx % grayscaleColors.length]);
        colorIdx++;
      }

      if (debouncedMatchStr == null || debouncedMatchStr === "" || DeckMatches(d, debouncedMatchStr, mainboardSideboard)) {
        filtered.push(d);
      }
    }

    filtered.sort((a, b) => {
      let sortA, sortB;
      switch (deckSort) {
        case "wins":
          sortA = DeckSortWins(a);
          sortB = DeckSortWins(b);
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
  }, [decks, draftDropdown, minCMC, maxCMC, colorCheckboxes, debouncedMatchStr, mainboardSideboard, deckSort]);

  return (
    <div className="deck-viewer-page">
      <div className="selectorbar" style={{"margin": "1rem"}}>
        <div className="selector-group">
          <DropdownHeader
            label="Draft"
            options={draftDropdownOptions}
            value={selectedDraft}
            onChange={onDraftSelected}
          />

          <DateSelector
            label="From"
            id="from"
            value={startDate}
            onChange={props.onStartSelected}
          />
          <DateSelector
            label="To"
            id="to"
            value={endDate}
            onChange={props.onEndSelected}
          />

          <DropdownHeader
            label="Board"
            options={boardOptions}
            value={mainboardSideboard}
            onChange={onBoardSelected}
          />

          <NumericInput
            label="Min CMC"
            value={minCMC}
            onChange={onMinCMCUpdated}
          />

          <NumericInput
            label="Max CMC"
            value={maxCMC}
            onChange={onMaxCMCUpdated}
          />

          <ColorPickerHeader
            display={colorCheckboxes}
            onChecked={onColorChecked}
          />
        </div>

        <div className="search-group">
          <TextInput
            label="Search"
            placeholder={QueryTerms}
            big={true}
            value={typingStr}
            onChange={(e) => setTypingStr(e.target.value)}
          />
        </div>
      </div>

      <div className="deck-viewer-container">
        <div className="deck-list-sidebar">
          <FilteredDecks
            decks={filteredAndSortedDecks.decks}
            draftToColor={filteredAndSortedDecks.colors}
            highlight={highlightedDecks}
            onDeckClicked={onDeckClicked}
            onSortHeader={onDeckSort}
          />
        </div>

        <div className="deck-main-content">
          <MainDisplay
            deck={deck}
            decks={decks}
            comparisonDecks={comparisonDecks}
            mbsb={mainboardSideboard}
            matchStr={debouncedMatchStr}
            description={description}
          />
        </div>
      </div>
    </div>
  );
}

function getMacro(deck) {
  if (deck.labels.includes("aggro")) {
    return "Aggro"
  } else if (deck.labels.includes("midrange")) {
    return "Midrange"
  } else if (deck.labels.includes("control")) {
    return "Control"
  } else if (deck.labels.includes("tempo")) {
    return "Tempo"
  }
  return "N/A"
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

  return (
    <div className="filtered-decks">
      <table className="widget-table" style={{"border": "none", "borderRadius": "0"}}>
        <thead className="table-header">
          <tr>
            <td colSpan="4" id="decklist-title" className="header-cell" style={{"textAlign": "center", "background": "var(--primary)", "color": "var(--page-background)"}}>{decks.length} Decks</td>
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
              let win_percent = Math.round(100 * GameWinPercent(deck))
              let macro = getMacro(deck)

              return (
                <tr className={className} key={idx} style={{"--background-color": color}} onClick={input.onDeckClicked} id={deck.metadata.path}>
                  <td style={{"width": "25%", "paddingLeft": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="date">{deck.date}</td>
                  <td style={{"width": "30%", "paddingRight": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="player">{deck.player}</td>
                  <td style={{"width": "25%", "paddingLeft": "10px", "whiteSpace": "nowrap"}} id={deck.metadata.path} key="wins">{record} ({win_percent}%)</td>
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

function DeckSortWins(deck) {
  // Primary sort by number of match wins, secondary by game win percentage.
  let gameWin = GameWinPercent(deck)
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

function GameWinPercent(deck) {
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
  let win_percent = Math.round(100 * GameWinPercent(input.deck))
  let macro = getMacro(input.deck)
  return (
      <table className="deck-meta-table">
      <tbody>
        <tr className="deck-entry" style={{"--background-color": input.color}}>
          <td style={{"width": "25%", "paddingLeft": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="date">{deck.date}</td>
          <td style={{"width": "30%", "paddingRight": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="player">{deck.player}</td>
          <td style={{"width": "25%", "paddingLeft": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="wins">{record} ({win_percent}%)</td>
          <td style={{"width": "20%", "paddingRight": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="macro">{macro}</td>
        </tr>
      </tbody>
      </table>
  );
}


// MainDisplay prints out the given deck.
function MainDisplay(input) {
  if (input.comparisonDecks.size > 1) {
    return CompareDecks(input);
  }
  return DisplayDeck(input);
}

function CompareDecks(input) {
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

function DisplayDeck(input) {
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
        <DeckReport player={deck.player} cardMap={cardMap} description={input.description} deck={deck} />
      </div>
    </div>
  );
}

function DeckReport(input) {
  if (input.description == "") {
    return;
  }

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
    <div className="decklist-description">
      <div className="table-header">
        Notes from the draft
      </div>

      <ReactMarkdown>
        {description}
      </ReactMarkdown>
    </div>
  );
}

function PlayerFrame(input) {
  let deck = input.deck
  let cards = deck.mainboard
  if (input.mbsb == "Sideboard") {
    cards = deck.sideboard
  }
  if (input.mbsb == "Pool") {
    cards = deck.pool
  }

  // Get fields to display.
  let labels = deck.labels.join(', ')
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

  return (
    <div className="player-frame">
      <div className="player-frame-header" style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "1rem", "borderBottom": "1px solid var(--border)", "paddingBottom": "0.5rem"}}>
        <h2 style={{"margin": "0", "color": "var(--primary)"}}>{deck.player}</h2>
        <div style={{"fontSize": "1.2rem"}}>{colors}</div>
      </div>
      
      <div className="stats-grid" style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit, minmax(200px, 1fr))", "gap": "1rem"}}>
        <div className="stat-item">
          <span className="player-frame-title">Record:</span>
          <span className="player-frame-value">{MatchWins(deck)}-{MatchLosses(deck)} ({Wins(deck)}-{Losses(deck)})</span>
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Type:</span>
          <span className="player-frame-value">{labels}</span>
        </div>
        <div className="stat-item">
          <span className="player-frame-title">Avg CMC:</span>
          <span className="player-frame-value">{acmc}</span>
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
            {deck.matches.map(function(match, i) {
              let result = "W"
              if (match.opponent.toLowerCase() == match.winner.toLowerCase()) result = "L"
              if (match.winner == "") result = "D"
              
              let opp_arch = "N/A"
              for (let d of input.decks) {
                if (d.player.toLowerCase() == match.opponent.toLowerCase() && d.date == deck.date) {
                  opp_arch = getMacro(d)
                  break
                }
              }
              
              return (
                <div key={i} className="match-pill" style={{"background": "var(--table-header-background)", "padding": "0.4rem 0.8rem", "borderRadius": "20px", "fontSize": "0.85rem", "border": "1px solid var(--border)"}}>
                  <span style={{"fontWeight": "bold", "marginRight": "0.5rem"}}>{match.opponent}:</span>
                  <span style={{"color": result === "W" ? "var(--success)" : result === "L" ? "var(--danger)" : "var(--white)"}}>{result}</span>
                  <span style={{"marginLeft": "0.5rem", "opacity": "0.7"}}>({Record(deck, match.opponent)}) | {opp_arch}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CardList({player, cards, deck, sb, opts, matchStr}) {
  // Figure out how many of this CMC there are.
  let num = 0
  for (var i in cards) {
    // Count the card if it matches the CMC, or if options specify to include
    // all cards greater than the given value.
    if (opts.gt && cards[i].cmc >= opts.cmc || cards[i].cmc === opts.cmc) {
      num += 1
    }
  }
  if (num === 0) {
    return null
  }

  let title = "CMC=" + opts.cmc + " (" + num + " cards)"
  if (opts.gt) {
    title = "CMC=" + opts.cmc + "+ (" + num + " cards)"
  }

  let key = player + opts.cmc

  let toDisplay = new Array()
  for (let card of cards) {
    if (opts.gt && card.cmc >= opts.cmc || card.cmc === opts.cmc) {
      toDisplay.push(card)
    }
  }

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
          toDisplay.map(function(card) {
            let key = card.name + cards.indexOf(card)
            let type = getType(card)
            let text = card.name
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
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{text}</a></td>
              </tr>
            )
          }).sort(cardSort)
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
