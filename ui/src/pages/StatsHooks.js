import { useState, useMemo, useEffect } from 'react';
import { LoadCube, LoadDecks, LoadArchetypeData, LoadDrafts } from "../utils/Fetch.js";
import { useCube } from "../contexts/CubeContext.js";
import { DeckBuckets } from "../utils/Buckets.js";
import { AggregatedPickInfo } from "../utils/DraftLog.js";
import { draftLabel } from "../utils/DraftInfo.js";
import { BuildGraphData } from "../stats/deckstats/graphData.js";
import { CheckboxesToColors } from "../utils/Utils.js";
import { fetchJson } from "../utils/fetchJson.js";
import { fromCallback } from "../stats/loading.js";
import { statsUrl, matchWithDeckColors } from "../stats/statsUrls.js";
import { colorStatsUrl } from "../stats/pageRequests.js";
import { heatmapColorType } from "../stats/colors/heatmapModel.js";
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
  const [colorSortBy, setColorSortBy] = useState("build");
  const [colorMode, setColorMode] = useState("exact");
  const [colorCheckboxes, setColorCheckboxes] = useState([false, false, false, false, false]);
  const [cardWidgetSelection, setCardWidgetSelection] = useState("Overview");
  const [minDrafts, setMinDrafts] = useState(0);
  const [minGames, setMinGames] = useState(0);
  const [winConfidence, setWinConfidence] = useState("0.95");
  const [minPlayers, setMinPlayers] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [selectedCard, setSelectedCard] = useState("");
  const [popularityFilter, setPopularityFilter] = useState("");
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
  const [playerSortBy, setPlayerSortBy] = useState("matches");
  const [playerSortInvert, setPlayerSortInvert] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [sortBy, setSortBy] = useState("");
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
    minPlayers, setMinPlayers,
    maxPlayers, setMaxPlayers,
    selectedCard, setSelectedCard,
    popularityFilter, setPopularityFilter,
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
    selectedPlayer, setSelectedPlayer,
    sortBy, setSortBy,
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

// toPlayerMap turns one set of player rows into a map by player, with each
// player's cards, archetypes, colors and opponents as maps.
function toPlayerMap(rows) {
  const players = new Map();
  for (const [name, data] of Object.entries(rows || {})) {
    players.set(name, {
      ...data,
      cards: new Map(Object.entries(data.unique_cards || {}).map(([cardName, count]) => [cardName, { name: cardName, count }])),
      archetype_stats: new Map(Object.entries(data.archetype_stats || {})),
      color_stats: new Map(Object.entries(data.color_stats || {})),
      opponents: new Map(Object.entries(data.opponents || {})),
    });
  }
  return players;
}

// toPlayerStats turns the players answer into a map by player.
function toPlayerStats(response) {
  return toPlayerMap(response.players);
}

// useStatsData loads the data a stats page shows and works out the values the
// widgets share. view is the page (cards, colors, types, deckstats or
// players); only that page's data is fetched, and all of it is fetched again
// when the cube changes. failed lists the page's data that didn't load.
// cardQuery is the Cards page's search, answered by the server as cardSearch.
export function useStatsData(filters, props, refresh, view, cardQuery) {
  const cubeID = useCube();

  const { startDate, endDate } = props;
  const match = props.matchStr || "";
  const {
    minDraftSize, cardWidgetColorSelection, minDrafts,
    minGames, winConfidence, bucketSize, colorMode, colorTypeSelection,
  } = filters;

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
      start: startDate, end: endDate, size: minDraftSize, match,
    })).then(toAllData),
    [cardWidgetColorSelection, minDrafts, minGames, winConfidence, startDate, endDate, minDraftSize, match, refresh], NO_MAP);

  const cardSearch = useCardSearch(cubeID, needs("cardStats") ? cardQuery : "", {
    color: cardWidgetColorSelection, min_drafts: minDrafts, min_games: minGames,
    start: startDate, end: endDate, size: minDraftSize, match,
  });

  const colorFilters = {
    start: startDate, end: endDate, size: minDraftSize, colorMode, confidence: winConfidence, match,
  }
  const colorStatsSource = useLoaded(cubeID, needs("colorStats"),
    () => fetchJson(colorStatsUrl(cubeID, colorFilters, 0)).then(toAllData),
    [colorMode, winConfidence, startDate, endDate, minDraftSize, match, refresh], NO_MAP);

  const colorStatsOverTimeSource = useLoaded(cubeID, needs("colorStatsOverTime"),
    () => fetchJson(colorStatsUrl(cubeID, colorFilters, bucketSize)).then(toBuckets),
    [colorMode, winConfidence, bucketSize, startDate, endDate, minDraftSize, match, refresh], NO_LIST);

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
      start: startDate, end: endDate, size: minDraftSize, confidence: winConfidence, match: archetypeMatch,
    })).then(toPlayerStats),
    [startDate, endDate, minDraftSize, winConfidence, archetypeMatch, refresh], NO_MAP);

  // The heatmap shows single colors or pairs only, so Any and Trio ask for pairs.
  const heatmapType = heatmapColorType(colorTypeSelection);
  const colorMatchupsSource = useLoaded(cubeID, needs("colorMatchups"),
    () => fetchJson(statsUrl(cubeID, "color-matchups", {
      start: startDate, end: endDate, size: minDraftSize, color_mode: colorMode, color_type: heatmapType,
      confidence: winConfidence, match,
    })).then(response => response.matchups || {}),
    [startDate, endDate, minDraftSize, colorMode, heatmapType, winConfidence, match, refresh], NO_OBJECT);

  // Each source by its name in viewSources.js, to list the ones that failed.
  const sources = {
    decks: decksSource, cube: cubeSource, drafts: draftsSource, archetypeMatchups: matchupsSource,
    cardStats: cardStatsSource,
    colorStats: colorStatsSource, colorStatsOverTime: colorStatsOverTimeSource, colorMatchups: colorMatchupsSource,
    archetypeStats: archetypeStatsSource, archetypeStatsOverTime: archetypeStatsOverTimeSource,
    playerStats: playerStatsSource, deckCharts: deckChartsSource,
  };
  const failed = ALL_SOURCES.filter(name => needs(name) && sources[name].failed);

  // Each loaded value under the name the rest of this hook and the pages read.
  const decks = decksSource.value;
  const decksLoaded = decksSource.loaded;
  const cube = cubeSource.value;
  const drafts = draftsSource.value;
  const archetypeMatchups = matchupsSource.value;
  const cardData = cardStatsSource.value;
  const colorData = colorStatsSource.value;
  const colorDataBucketed = colorStatsOverTimeSource.value;
  const archetypeStats = archetypeStatsSource.value;
  const archetypeBuckets = archetypeStatsOverTimeSource.value;
  const deckCharts = deckChartsSource.value;
  const playerData = playerStatsSource.value;
  const colorMatchupData = colorMatchupsSource.value;

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

  const deckBuckets = useMemo(() => {
    if (filteredDecks.length === 0) return [];
    return DeckBuckets(filteredDecks, bucketSize, false);
  }, [filteredDecks, bucketSize]);

  const pickInfo = useMemo(() => AggregatedPickInfo(drafts, cube, ""), [drafts, cube]);

  const parsed = useMemo(() => ({
    bucketSize, filteredDecks, archetypeData, archetypeBuckets, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets,
  }), [bucketSize, filteredDecks, archetypeData, archetypeBuckets, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets]);

  const graphData = useMemo(() => BuildGraphData({ filteredDecks, deckBuckets, bucketSize }), [filteredDecks, deckBuckets, bucketSize]);

  const draftLogs = useMemo(() => {
    let opts = [{ label: "", value: "" }];
    for (let draft of Object.values(drafts || {})) {
      if (draft.type !== "Draft") continue;
      opts.push({ label: draftLabel(draft.draft), value: String(draft.draft.id) });
    }
    return opts;
  }, [drafts]);

  return {
    decks, decksLoaded, cube, drafts, archetypeMatchups, cardData, cardSearch,
    colorData, colorDataBucketed, colorMatchupData,
    parsed, graphData, draftLogs, failed, deckCharts,
  };
}

// CARD_SEARCH_DELAY_MS is how long the Cards page's search waits after typing
// stops before asking the server.
const CARD_SEARCH_DELAY_MS = 250;

// NO_CARD_SEARCH is the answer with no search: every card shows.
const NO_CARD_SEARCH = { names: null, error: "" };

// useCardSearch asks the server which cards match the Cards page's search,
// judged against the decks the page's filters pick. names is a Set of the
// matching card names, or null when there's no search (or no answer yet), so
// every card shows; error says why a search doesn't parse.
function useCardSearch(cubeID, query, params) {
  const [result, setResult] = useState(NO_CARD_SEARCH);
  const url = statsUrl(cubeID, "cards/search", { ...params, q: query });

  useEffect(() => {
    if (!query || !query.trim()) {
      setResult(NO_CARD_SEARCH);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      fetchJson(url)
        .then(resp => {
          if (live) {
            setResult({ names: resp.error ? null : new Set(resp.names), error: resp.error || "" });
          }
        })
        .catch(() => {});
    }, CARD_SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [url]);

  return result;
}
