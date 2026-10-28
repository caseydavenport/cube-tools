import { useState, useMemo } from 'react';
import { LoadCube, LoadDecks, LoadArchetypeData, LoadDrafts } from "../utils/Fetch.js";
import { useCube } from "../contexts/CubeContext.js";
import { PlayerData } from "./Players.js";
import { DeckBuckets } from "../utils/Buckets.js";
import { AggregatedPickInfo } from "../utils/DraftLog.js";
import { draftLabel } from "../utils/DraftInfo.js";
import { BuildGraphData } from "../stats/deckstats/graphData.js";
import { CheckboxesToColors } from "../utils/Utils.js";
import { useCubeInfo } from "../utils/useCubeWritable.js";
import { requestFilters } from "../stats/hiddenFilters.js";
import { fetchJson } from "../utils/fetchJson.js";
import { fromCallback } from "../stats/loading.js";
import { statsUrl, matchWithDeckColors } from "../stats/statsUrls.js";
import { ALL_SOURCES, viewNeeds } from "../stats/viewSources.js";
import { useLoaded } from "../stats/useLoaded.js";
import { NO_DECK_CHARTS, toDeckCharts } from "../stats/deckstats/deckChartsData.js";
import { DEFAULT_CARD_X_AXIS, DEFAULT_CARD_Y_AXIS, DEFAULT_DECK_X_AXIS, DEFAULT_DECK_Y_AXIS } from "../stats/scatterAxes.js";

export function useStatsFilters() {
  const [bucketSize, setBucketSize] = useState(5);
  const [minDraftSize, setMinDraftSize] = useState(0);
  const [manaValue, setManaValue] = useState(-1);
  const [selectedBucket, setSelectedBucket] = useState("ALL");
  const [colorTypeSelection, setColorTypeSelection] = useState("Any");
  const [colorSortBy, setColorSortBy] = useState("win");
  const [colorMode, setColorMode] = useState("exact");
  const [colorCheckboxes, setColorCheckboxes] = useState([false, false, false, false, false]);
  const [cardWidgetSelection, setCardWidgetSelection] = useState("Overview");
  const [minDrafts, setMinDrafts] = useState(0);
  const [minGames, setMinGames] = useState(0);
  const [winConfidence, setWinConfidence] = useState("0.95");
  const [significantOnly, setSignificantOnly] = useState(false);
  const [minPlayers, setMinPlayers] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [selectedCard, setSelectedCard] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [cardWidgetColorSelection, setCardWidgetColorSelection] = useState("");
  const [cardWidgetSortBy, setCardWidgetSortBy] = useState("");
  const [cardWidgetSortInvert, setCardWidgetSortInvert] = useState(false);
  const [cardXAxis, setCardXAxis] = useState(DEFAULT_CARD_X_AXIS);
  const [cardYAxis, setCardYAxis] = useState(DEFAULT_CARD_Y_AXIS);
  const [deckXAxis, setDeckXAxis] = useState(DEFAULT_DECK_X_AXIS);
  const [deckYAxis, setDeckYAxis] = useState(DEFAULT_DECK_Y_AXIS);
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
  const [minSynergyDecks, setMinSynergyDecks] = useState(5);
  const [focalThreshold, setFocalThreshold] = useState(1.5);
  const [smoothingK, setSmoothingK] = useState(5);
  const [colorAdjust, setColorAdjust] = useState(false);
  const [synergyRecord, setSynergyRecord] = useState("all");
  const [synergySortBy, setSynergySortBy] = useState("synergy");
  const [display, setDisplay] = useState([true, false, false, false, false, false, false, false, false]);

  return {
    bucketSize, setBucketSize,
    minDraftSize, setMinDraftSize,
    manaValue, setManaValue,
    selectedBucket, setSelectedBucket,
    colorTypeSelection, setColorTypeSelection,
    colorSortBy, setColorSortBy,
    colorMode, setColorMode,
    colorCheckboxes, setColorCheckboxes,
    cardWidgetSelection, setCardWidgetSelection,
    minDrafts, setMinDrafts,
    minGames, setMinGames,
    winConfidence, setWinConfidence,
    significantOnly, setSignificantOnly,
    minPlayers, setMinPlayers,
    maxPlayers, setMaxPlayers,
    selectedCard, setSelectedCard,
    cardFilter, setCardFilter,
    tagFilter, setTagFilter,
    cardWidgetColorSelection, setCardWidgetColorSelection,
    cardWidgetSortBy, setCardWidgetSortBy,
    cardWidgetSortInvert, setCardWidgetSortInvert,
    cardXAxis, setCardXAxis,
    cardYAxis, setCardYAxis,
    deckXAxis, setDeckXAxis,
    deckYAxis, setDeckYAxis,
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
    focalThreshold, setFocalThreshold,
    smoothingK, setSmoothingK,
    colorAdjust, setColorAdjust,
    synergyRecord, setSynergyRecord,
    synergySortBy, setSynergySortBy,
    display, setDisplay,
  };
}

// Starting values for data that hasn't loaded yet. They're shared constants so
// they stay the same object between renders, which keeps the useMemo blocks
// below from recomputing for nothing.
const NO_DECKS = [];
const NO_CUBE = { "cards": [] };
const NO_MATCHUPS = { items: [] };
const NO_MAP = new Map();
const NO_LIST = [];
const NO_OBJECT = {};
const NO_COMPARE = { winning: null, losing: null };

// The functions below reshape a stats endpoint's answer into what the pages read.

// toAllData turns a card or color stats answer into a map by name.
function toAllData(response) {
  return new Map(Object.entries(response.all.data));
}

// toBuckets returns the time buckets of a stats-over-time answer.
function toBuckets(response) {
  return Array.from(response.buckets);
}

// toArchetypeMap turns one set of archetype rows from the server into a map by
// archetype, with each row's nested objects as maps too.
function toArchetypeMap(rows) {
  const archetypes = new Map();
  for (const [name, data] of Object.entries(rows || {})) {
    archetypes.set(name, {
      ...data,
      shared_with: new Map(Object.entries(data.shared_with || {})),
      players: new Map(Object.entries(data.players || {})),
    });
  }
  return archetypes;
}

// toArchetypeStats turns the archetypes answer into a map by archetype.
function toArchetypeStats(response) {
  return toArchetypeMap(response.archetypes);
}

// toArchetypeBuckets turns a bucketed archetypes answer into a list of time
// buckets, each with its start date and its archetype rows as a map.
function toArchetypeBuckets(response) {
  const buckets = [];
  for (const bucket of response.buckets || []) {
    buckets.push({ name: bucket.name, start: bucket.start, archetypeData: toArchetypeMap(bucket.archetypes) });
  }
  return buckets;
}

// toPlayerStats turns the players answer into a map by player, with each
// player's cards, archetypes, and colors as maps.
function toPlayerStats(response) {
  const players = new Map();
  for (const [name, data] of Object.entries(response.players)) {
    players.set(name, {
      ...data,
      cards: new Map(Object.entries(data.unique_cards || {}).map(([cardName, count]) => [cardName, { name: cardName, count }])),
      archetype_stats: new Map(Object.entries(data.archetype_stats || {})),
      color_stats: new Map(Object.entries(data.color_stats || {})),
    });
  }
  return players;
}

// useStatsData loads the data a stats page shows and works out the values the
// widgets share. view is the page (cards, colors, types, deckstats, synergy,
// health, designmap, or players); only that page's data is fetched, and all of
// it is fetched again when the cube changes. failed lists the page's data that
// didn't load.
export function useStatsData(filters, props, refresh, view) {
  const cubeID = useCube();
  const info = useCubeInfo(cubeID);

  const { startDate, endDate } = props;
  const match = props.matchStr || "";
  const {
    minDraftSize, cardWidgetColorSelection, minDrafts,
    minGames, winConfidence, bucketSize, colorMode, minSynergyDecks,
    focalThreshold, smoothingK, colorAdjust, colorTypeSelection,
  } = filters;

  // A control the cube hides doesn't filter, even if it was set on another cube.
  const { significantOnly, synergyRecord } = requestFilters(filters, info);

  // needs reports whether this page shows a source, so its request is skipped otherwise.
  const needs = source => viewNeeds(view, source);

  // The archetype stats come from the server, so the color checkboxes travel
  // with the search as a dcolor: term.
  const archetypeMatch = matchWithDeckColors(match, CheckboxesToColors(filters.colorCheckboxes));

  const decksSource = useLoaded(cubeID, needs("decks"),
    () => fromCallback(resolve => LoadDecks(cubeID, resolve, startDate, endDate, minDraftSize, "", match)),
    [startDate, endDate, minDraftSize, match, refresh], NO_DECKS);

  const cubeSource = useLoaded(cubeID, needs("cube"),
    () => fromCallback(resolve => LoadCube(cubeID, resolve)),
    [refresh], NO_CUBE);

  const draftsSource = useLoaded(cubeID, needs("drafts"),
    () => fromCallback(resolve => LoadDrafts(cubeID, resolve, startDate, endDate)),
    [startDate, endDate, refresh], null);

  const matchupsSource = useLoaded(cubeID, needs("archetypeMatchups"),
    () => fromCallback(resolve => LoadArchetypeData(cubeID, resolve, startDate, endDate, minDraftSize, "", match)),
    [startDate, endDate, minDraftSize, match, refresh], NO_MATCHUPS);

  const cardStatsSource = useLoaded(cubeID, needs("cardStats"),
    () => fetchJson(statsUrl(cubeID, "cards", {
      color: cardWidgetColorSelection, min_drafts: minDrafts, min_games: minGames, confidence: winConfidence,
      significant_only: significantOnly, start: startDate, end: endDate, size: minDraftSize, match,
    })).then(toAllData),
    [cardWidgetColorSelection, minDrafts, minGames, winConfidence, significantOnly, startDate, endDate, minDraftSize, match, refresh], NO_MAP);

  const cardStatsOverTimeSource = useLoaded(cubeID, needs("cardStatsOverTime"),
    () => fetchJson(statsUrl(cubeID, "cards", {
      color: cardWidgetColorSelection, min_drafts: minDrafts, min_games: minGames, bucket_size: bucketSize, sliding: true, match,
    })).then(toBuckets),
    [cardWidgetColorSelection, minDrafts, minGames, bucketSize, match, refresh], NO_LIST);

  const colorStatsSource = useLoaded(cubeID, needs("colorStats"),
    () => fetchJson(statsUrl(cubeID, "colors", {
      start: startDate, end: endDate, size: minDraftSize, color_mode: colorMode, confidence: winConfidence, match,
    })).then(toAllData),
    [colorMode, winConfidence, startDate, endDate, minDraftSize, match, refresh], NO_MAP);

  const colorStatsOverTimeSource = useLoaded(cubeID, needs("colorStatsOverTime"),
    () => fetchJson(statsUrl(cubeID, "colors", {
      start: startDate, end: endDate, size: minDraftSize, color_mode: colorMode, bucket_size: bucketSize, sliding: true, match,
    })).then(toBuckets),
    [colorMode, bucketSize, startDate, endDate, minDraftSize, match, refresh], NO_LIST);

  const archetypeStatsSource = useLoaded(cubeID, needs("archetypeStats"),
    () => fetchJson(statsUrl(cubeID, "archetypes", {
      start: startDate, end: endDate, size: minDraftSize, confidence: winConfidence, match: archetypeMatch,
    })).then(toArchetypeStats),
    [startDate, endDate, minDraftSize, winConfidence, archetypeMatch, refresh], NO_MAP);

  const archetypeStatsOverTimeSource = useLoaded(cubeID, needs("archetypeStatsOverTime"),
    () => fetchJson(statsUrl(cubeID, "archetypes", {
      start: startDate, end: endDate, size: minDraftSize, confidence: winConfidence,
      bucket_size: bucketSize, sliding: true, match: archetypeMatch,
    })).then(toArchetypeBuckets),
    [startDate, endDate, minDraftSize, winConfidence, bucketSize, archetypeMatch, refresh], NO_LIST);

  // The Deck Stats charts read the color checkboxes the same way the archetype stats do.
  const deckChartsSource = useLoaded(cubeID, needs("deckCharts"),
    () => fetchJson(statsUrl(cubeID, "deck-charts", {
      start: startDate, end: endDate, size: minDraftSize, confidence: winConfidence, match: archetypeMatch,
    })).then(toDeckCharts),
    [startDate, endDate, minDraftSize, winConfidence, archetypeMatch, refresh], NO_DECK_CHARTS);

  const playerStatsSource = useLoaded(cubeID, needs("playerStats"),
    () => fetchJson(statsUrl(cubeID, "players", {
      start: startDate, end: endDate, size: minDraftSize, match,
    })).then(toPlayerStats),
    [startDate, endDate, minDraftSize, match, refresh], NO_MAP);

  // The synergy settings both synergy requests share.
  const synergyParams = {
    min_decks: minSynergyDecks, focal_threshold: focalThreshold, smoothing_k: smoothingK, color_adjust: colorAdjust,
  };

  const synergySource = useLoaded(cubeID, needs("synergy"),
    () => fetchJson(statsUrl(cubeID, "synergy", {
      ...synergyParams, record: synergyRecord, start: startDate, end: endDate, size: minDraftSize, match,
    })),
    [minSynergyDecks, focalThreshold, smoothingK, colorAdjust, synergyRecord, minDraftSize, startDate, endDate, match, refresh], NO_LIST);

  // The comparison view loads both pools regardless of the record toggle, so
  // it can show how a card's focal score shifts between winning and losing.
  const synergyCompareSource = useLoaded(cubeID, needs("synergyCompare"),
    () => {
      const base = { ...synergyParams, start: startDate, end: endDate, size: minDraftSize, match };
      return Promise.all([
        fetchJson(statsUrl(cubeID, "synergy", { ...base, record: "winning" })),
        fetchJson(statsUrl(cubeID, "synergy", { ...base, record: "losing" })),
      ]).then(([winning, losing]) => ({ winning, losing }));
    },
    [minSynergyDecks, focalThreshold, smoothingK, colorAdjust, minDraftSize, startDate, endDate, match, refresh], NO_COMPARE);

  const colorMatchupsSource = useLoaded(cubeID, needs("colorMatchups"),
    () => fetchJson(statsUrl(cubeID, "color-matchups", {
      start: startDate, end: endDate, size: minDraftSize, color_mode: colorMode, color_type: colorTypeSelection, match,
    })).then(response => response.matchups || {}),
    [startDate, endDate, minDraftSize, colorMode, colorTypeSelection, match, refresh], NO_OBJECT);

  const designGraphSource = useLoaded(cubeID, needs("designGraph"),
    () => fetchJson(`/api/${cubeID}/stats/design-graph`),
    [refresh], NO_OBJECT);

  const healthSource = useLoaded(cubeID, needs("health"),
    () => fetchJson(statsUrl(cubeID, "health", {
      bucket_size: bucketSize, sliding: true, start: startDate, end: endDate, size: minDraftSize, match,
    })).then(response => response.buckets || []),
    [bucketSize, startDate, endDate, minDraftSize, match, refresh], NO_LIST);

  // Each source by its name in viewSources.js, to list the ones that failed.
  const sources = {
    decks: decksSource, cube: cubeSource, drafts: draftsSource, archetypeMatchups: matchupsSource,
    cardStats: cardStatsSource, cardStatsOverTime: cardStatsOverTimeSource,
    colorStats: colorStatsSource, colorStatsOverTime: colorStatsOverTimeSource, colorMatchups: colorMatchupsSource,
    archetypeStats: archetypeStatsSource, archetypeStatsOverTime: archetypeStatsOverTimeSource,
    playerStats: playerStatsSource, deckCharts: deckChartsSource,
    synergy: synergySource, synergyCompare: synergyCompareSource,
    designGraph: designGraphSource, health: healthSource,
  };
  const failed = ALL_SOURCES.filter(name => needs(name) && sources[name].failed);

  // Each loaded value under the name the rest of this hook and the pages read.
  const decks = decksSource.value;
  const decksLoaded = decksSource.loaded;
  const cube = cubeSource.value;
  const drafts = draftsSource.value;
  const archetypeMatchups = matchupsSource.value;
  const cardData = cardStatsSource.value;
  const cardDataBucketed = cardStatsOverTimeSource.value;
  const colorData = colorStatsSource.value;
  const colorDataBucketed = colorStatsOverTimeSource.value;
  const archetypeStats = archetypeStatsSource.value;
  const archetypeBuckets = archetypeStatsOverTimeSource.value;
  const deckCharts = deckChartsSource.value;
  const playerStats = playerStatsSource.value;
  const synergyData = synergySource.value;
  const synergyCompare = synergyCompareSource.value;
  const colorMatchupData = colorMatchupsSource.value;
  const designGraphData = designGraphSource.value;
  const healthData = healthSource.value;

  // Derived Data
  const filteredDecks = useMemo(() => {
    if (decks.length === 0) return [];
    let filterByColor = filters.colorCheckboxes.some(e => e);
    return decks.filter(deck => {
      // Decks are already filtered by props.matchStr on the server.
      if (filterByColor) {
        let enabledColors = CheckboxesToColors(filters.colorCheckboxes);
        for (let color of enabledColors) {
          if (!deck.colors.includes(color)) return false;
        }
      }
      return true;
    });
  }, [decks, filters.colorCheckboxes, refresh]);

  const archetypeData = archetypeStats;

  const playerData = useMemo(() => {
    let filterByColor = filters.colorCheckboxes.some(e => e);
    if (filterByColor || props.matchStr) {
      return PlayerData(filteredDecks);
    }
    return playerStats instanceof Map ? playerStats : new Map(Object.entries(playerStats));
  }, [filteredDecks, playerStats, filters.colorCheckboxes, props.matchStr]);

  const deckBuckets = useMemo(() => {
    if (filteredDecks.length === 0) return [];
    const db = DeckBuckets(filteredDecks, bucketSize, false);
    for (let b of db) {
      let bucketDecks = [];
      for (let draft of b) bucketDecks = bucketDecks.concat(draft.decks);
      b.playerData = PlayerData(bucketDecks);
    }
    return db;
  }, [filteredDecks, bucketSize]);

  const pickInfo = useMemo(() => AggregatedPickInfo(drafts, cube, ""), [drafts, cube]);

  const parsed = useMemo(() => ({
    bucketSize, filteredDecks, archetypeData, archetypeBuckets, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets,
  }), [bucketSize, filteredDecks, archetypeData, archetypeBuckets, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets]);

  const graphData = useMemo(() => BuildGraphData({ filteredDecks, deckBuckets, bucketSize }), [filteredDecks, deckBuckets, bucketSize]);

  const archetypeDropdownOptions = useMemo(() => {
    let archetypes = new Map();
    for (let deck of decks) {
      if (deck.macro_archetype) archetypes.set(deck.macro_archetype, 0);
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
      opts.push({ label: draftLabel(draft.draft), value: String(draft.draft.id) });
    }
    return opts;
  }, [drafts]);

  return {
    decks, decksLoaded, cube, drafts, archetypeMatchups, cardData, cardDataBucketed,
    colorData, colorDataBucketed, synergyData, synergyCompare, colorMatchupData, healthData,
    designGraphData, parsed, graphData, archetypeDropdownOptions, draftLogs, failed, deckCharts,
  };
}
