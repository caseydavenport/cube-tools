import React, { useState, useEffect, useMemo } from 'react';
import { LoadCube, LoadDecks, LoadArchetypeData, LoadDrafts } from "../utils/Fetch.js";
import { ArchetypeData } from "./Types.js";
import { PlayerData } from "./Players.js";
import { GetColorStats } from "./Colors.js";
import { DeckBuckets } from "../utils/Buckets.js";
import { AggregatedPickInfo } from "../utils/DraftLog.js";
import { DeckMatches } from "../utils/Query.js";
import { BuildGraphData } from "./Decks.js";
import { CheckboxesToColors } from "../utils/Utils.js";

export function useStatsFilters() {
  const [bucketSize, setBucketSize] = useState(5);
  const [playerMatch, setPlayerMatch] = useState("");
  const [minDraftSize, setMinDraftSize] = useState(0);
  const [manaValue, setManaValue] = useState(-1);
  const [selectedBucket, setSelectedBucket] = useState("ALL");
  const [colorTypeSelection, setColorTypeSelection] = useState("Mono");
  const [colorSortBy, setColorSortBy] = useState("win");
  const [strictColors, setStrictColors] = useState(false);
  const [colorCheckboxes, setColorCheckboxes] = useState([false, false, false, false, false]);
  const [cardWidgetSelection, setCardWidgetSelection] = useState("Mainboard rate");
  const [minDrafts, setMinDrafts] = useState(0);
  const [minGames, setMinGames] = useState(0);
  const [minPlayers, setMinPlayers] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [selectedCard, setSelectedCard] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [cardWidgetColorSelection, setCardWidgetColorSelection] = useState("");
  const [cardWidgetSortBy, setCardWidgetSortBy] = useState("");
  const [xAxis, setXAxis] = useState("# Decks");
  const [yAxis, setYAxis] = useState("Pick ELO");
  const [draftSortBy, setDraftSortBy] = useState("p1p1");
  const [draftSortInvert, setDraftSortInvert] = useState(false);
  const [minDeviation, setMinDeviation] = useState(0);
  const [maxDeviation, setMaxDeviation] = useState(0);
  const [minAvgPick, setMinAvgPick] = useState(0);
  const [maxAvgPick, setMaxAvgPick] = useState(0);
  const [selectedDraftLog, setSelectedDraftLog] = useState("");
  const [selectedDraftPlayer, setSelectedDraftPlayer] = useState("");
  const [draftPlayers, setDraftPlayers] = useState([]);
  const [draftPacks, setDraftPacks] = useState([]);
  const [selectedPack, setSelectedPack] = useState(1);
  const [playerSortBy, setPlayerSortBy] = useState("");
  const [playerSortInvert, setPlayerSortInvert] = useState(false);
  const [oppSortBy, setOppSortBy] = useState("win_pct");
  const [oppSortInvert, setOppSortInvert] = useState(false);
  const [playerArchSortBy, setPlayerArchSortBy] = useState("build");
  const [playerArchSortInvert, setPlayerArchSortInvert] = useState(false);
  const [playerColorSortBy, setPlayerColorSortBy] = useState("build_pct");
  const [playerColorSortInvert, setPlayerColorSortInvert] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedArchetype, setSelectedArchetype] = useState("aggro");
  const [sortBy, setSortBy] = useState("");
  const [minSynergyDecks, setMinSynergyDecks] = useState(3);
  const [synergySortBy, setSynergySortBy] = useState("synergy");
  const [display, setDisplay] = useState([true, false, false, false, false, false, false]);

  return {
    bucketSize, setBucketSize,
    playerMatch, setPlayerMatch,
    minDraftSize, setMinDraftSize,
    manaValue, setManaValue,
    selectedBucket, setSelectedBucket,
    colorTypeSelection, setColorTypeSelection,
    colorSortBy, setColorSortBy,
    strictColors, setStrictColors,
    colorCheckboxes, setColorCheckboxes,
    cardWidgetSelection, setCardWidgetSelection,
    minDrafts, setMinDrafts,
    minGames, setMinGames,
    minPlayers, setMinPlayers,
    maxPlayers, setMaxPlayers,
    selectedCard, setSelectedCard,
    cardFilter, setCardFilter,
    cardWidgetColorSelection, setCardWidgetColorSelection,
    cardWidgetSortBy, setCardWidgetSortBy,
    xAxis, setXAxis,
    yAxis, setYAxis,
    draftSortBy, setDraftSortBy,
    draftSortInvert, setDraftSortInvert,
    minDeviation, setMinDeviation,
    maxDeviation, setMaxDeviation,
    minAvgPick, setMinAvgPick,
    maxAvgPick, setMaxAvgPick,
    selectedDraftLog, setSelectedDraftLog,
    selectedDraftPlayer, setSelectedDraftPlayer,
    draftPlayers, setDraftPlayers,
    draftPacks, setDraftPacks,
    selectedPack, setSelectedPack,
    playerSortBy, setPlayerSortBy,
    playerSortInvert, setPlayerSortInvert,
    oppSortBy, setOppSortBy,
    oppSortInvert, setOppSortInvert,
    playerArchSortBy, setPlayerArchSortBy,
    playerArchSortInvert, setPlayerArchSortInvert,
    playerColorSortBy, setPlayerColorSortBy,
    playerColorSortInvert, setPlayerColorSortInvert,
    selectedPlayer, setSelectedPlayer,
    selectedArchetype, setSelectedArchetype,
    sortBy, setSortBy,
    minSynergyDecks, setMinSynergyDecks,
    synergySortBy, setSynergySortBy,
    display, setDisplay,
  };
}

export function useStatsData(filters, props, refresh) {
  const [decks, setDecks] = useState([]);
  const [cube, setCube] = useState({ "cards": [] });
  const [drafts, setDrafts] = useState(null);
  const [archetypeMatchups, setArchetypeMatchups] = useState([]);
  const [cardData, setCardData] = useState(new Map());
  const [cardDataBucketed, setCardDataBucketed] = useState([]);
  const [colorData, setColorData] = useState(new Map());
  const [colorDataBucketed, setColorDataBucketed] = useState([]);
  const [archetypeStats, setArchetypeStats] = useState(new Map());
  const [playerStats, setPlayerStats] = useState(new Map());
  const [synergyData, setSynergyData] = useState([]);

  const { startDate, endDate } = props;
  const { 
    minDraftSize, playerMatch, cardWidgetColorSelection, minDrafts, 
    minGames, bucketSize, strictColors, minSynergyDecks 
  } = filters;

  // Initial Load
  useEffect(() => {
    Promise.all([
      LoadDecks(setDecks, startDate, endDate, minDraftSize, playerMatch),
      LoadDrafts(setDrafts, startDate, endDate),
      LoadCube(setCube),
      LoadArchetypeData(setArchetypeMatchups, startDate, endDate, minDraftSize, playerMatch),
    ]);
  }, [refresh, startDate, endDate, minDraftSize, playerMatch]);

  // Card Data
  useEffect(() => {
    fetch(`/api/stats/cards?color=${cardWidgetColorSelection}&min_drafts=${minDrafts}&min_games=${minGames}&start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`)
      .then(r => r.json())
      .then(d => setCardData(new Map(Object.entries(d.all.data))));
  }, [cardWidgetColorSelection, minDrafts, minGames, startDate, endDate, minDraftSize, playerMatch, refresh]);

  useEffect(() => {
    fetch(`/api/stats/cards?color=${cardWidgetColorSelection}&min_drafts=${minDrafts}&min_games=${minGames}&bucket_size=${bucketSize}&sliding=true`)
      .then(r => r.json())
      .then(d => setCardDataBucketed(Array.from(d.buckets)));
  }, [cardWidgetColorSelection, minDrafts, minGames, bucketSize, refresh]);

  // Color Data
  useEffect(() => {
    fetch(`/api/stats/colors?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}&strict_colors=${strictColors}`)
      .then(r => r.json())
      .then(d => setColorData(new Map(Object.entries(d.all.data))));
  }, [strictColors, startDate, endDate, minDraftSize, playerMatch, refresh]);

  useEffect(() => {
    fetch(`/api/stats/colors?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}&strict_colors=${strictColors}&bucket_size=${bucketSize}&sliding=true`)
      .then(r => r.json())
      .then(d => setColorDataBucketed(Array.from(d.buckets)));
  }, [strictColors, bucketSize, startDate, endDate, minDraftSize, playerMatch, refresh]);

  // Archetype & Player Stats (Aggregated)
  useEffect(() => {
    fetch(`/api/stats/archetypes?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`)
      .then(r => r.json())
      .then(d => {
        const archetypes = new Map();
        for (const [name, data] of Object.entries(d.archetypes)) {
          archetypes.set(name, {
            ...data,
            shared_with: new Map(Object.entries(data.shared_with || {})),
            players: new Map(Object.entries(data.players || {})),
          });
        }
        setArchetypeStats(archetypes);
      });

    fetch(`/api/stats/players?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`)
      .then(r => r.json())
      .then(d => {
        const players = new Map();
        for (const [name, data] of Object.entries(d.players)) {
          players.set(name, {
            ...data,
            cards: new Map(Object.entries(data.unique_cards || {}).map(([cardName, count]) => [cardName, { name: cardName, count }])),
            archetype_stats: new Map(Object.entries(data.archetype_stats || {})),
            color_stats: new Map(Object.entries(data.color_stats || {})),
          });
        }
        setPlayerStats(players);
      });
  }, [startDate, endDate, minDraftSize, playerMatch, refresh]);

  // Synergy Data
  useEffect(() => {
    fetch(`/api/stats/synergy?min_decks=${minSynergyDecks}&start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`)
      .then(r => r.json())
      .then(d => setSynergyData(d));
  }, [minSynergyDecks, minDraftSize, playerMatch, startDate, endDate, refresh]);

  // Derived Data
  const filteredDecks = useMemo(() => {
    if (decks.length === 0) return [];
    let filterByColor = filters.colorCheckboxes.some(e => e);
    return decks.filter(deck => {
      if (props.matchStr && !DeckMatches(deck, props.matchStr, "Mainboard")) return false;
      if (filterByColor) {
        let enabledColors = CheckboxesToColors(filters.colorCheckboxes);
        for (let color of enabledColors) {
          if (!deck.colors.includes(color)) return false;
        }
      }
      return true;
    });
  }, [decks, filters.colorCheckboxes, props.matchStr, refresh]);

  const archetypeData = useMemo(() => {
    let filterByColor = filters.colorCheckboxes.some(e => e);
    if (filterByColor || props.matchStr) return ArchetypeData(filteredDecks);
    return archetypeStats instanceof Map ? archetypeStats : new Map(Object.entries(archetypeStats));
  }, [filteredDecks, archetypeStats, filters.colorCheckboxes, props.matchStr]);

  const playerData = useMemo(() => {
    let filterByColor = filters.colorCheckboxes.some(e => e);
    if (filterByColor || props.matchStr) {
      const pd = PlayerData(filteredDecks);
      for (let d of pd.values()) {
        d.archetype_stats = ArchetypeData(d.decks);
        d.color_stats = GetColorStats(d.decks, filters.strictColors);
      }
      return pd;
    }
    return playerStats instanceof Map ? playerStats : new Map(Object.entries(playerStats));
  }, [filteredDecks, playerStats, filters.colorCheckboxes, props.matchStr, filters.strictColors]);

  const deckBuckets = useMemo(() => {
    if (filteredDecks.length === 0) return [];
    const db = DeckBuckets(filteredDecks, bucketSize, false);
    for (let b of db) {
      let bucketDecks = [];
      for (let draft of b) bucketDecks = bucketDecks.concat(draft.decks);
      b.archetype_data = ArchetypeData(bucket_decks);
      b.player_data = PlayerData(bucket_decks);
    }
    return db;
  }, [filteredDecks, bucketSize]);

  const pickInfo = useMemo(() => AggregatedPickInfo(drafts, cube, playerMatch), [drafts, cube, playerMatch]);

  const parsed = useMemo(() => ({
    bucketSize, filteredDecks, archetypeData, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets,
  }), [bucketSize, filteredDecks, archetypeData, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets]);

  const graphData = useMemo(() => BuildGraphData(parsed), [parsed]);

  const archetypeDropdownOptions = useMemo(() => {
    let archetypes = new Map();
    for (let deck of decks) {
      for (let arch of deck.labels || []) {
        archetypes.set(arch, 0);
      }
    }
    let opts = [];
    for (let arch of archetypes.keys()) {
      opts.push({ label: arch, value: arch });
    }
    // Sort archetypes alphabetically
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [decks]);

  const draftLogs = useMemo(() => {
    let opts = [{ label: "", value: "" }];
    for (let draft of Object.values(drafts || {})) {
      if (draft.type !== "Draft") continue;
      opts.push({ label: draft.date, value: draft.date });
    }
    return opts;
  }, [drafts]);

  return {
    decks, cube, drafts, archetypeMatchups, cardData, cardDataBucketed,
    colorData, colorDataBucketed, synergyData, parsed, graphData,
    archetypeDropdownOptions, draftLogs
  };
}
