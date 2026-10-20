// The axis choices for the Cards and Deck stats scatter plots, and the
// axes the pages open with. Each axis has a fixed value the code switches
// on; only its label comes from COPY, so rewording a label can't change which
// plot opens. Kept free of React so node tests can load it.

import { CARDS_COPY } from "./cards/copy.js"
import { DECKSTATS_COPY } from "./deckstats/copy.js"

// The values getValue switches on in CardScatter.js.
export const CardAxis = {
  numDecks: "num_decks",
  numSideboard: "num_sideboard",
  mainboardPercent: "mainboard_percent",
  sideboardPercent: "sideboard_percent",
  winPercent: "win_percent",
  winPercentVsAvg: "win_percent_vs_avg",
  percentOfWins: "percent_of_wins",
  numWins: "num_wins",
  expectedWinPercent: "expected_win_percent",
  pickElo: "pick_elo",
  matchElo: "match_elo",
  numGames: "num_games",
  manaValue: "mana_value",
  numPlayers: "num_players",
  draftPick: "draft_pick",
  numTrophies: "num_trophies",
  numLastPlace: "num_last_place",
  vsAggro: "vs_aggro",
  vsControl: "vs_control",
  vsMidrange: "vs_midrange",
  inAggro: "in_aggro",
  inControl: "in_control",
  inMidrange: "in_midrange",
  wordCount: "word_count",
}

// The values getValue switches on in DeckScatter.js.
export const DeckAxis = {
  interaction: "interaction",
  creatures: "creatures",
  winPercent: "win_percent",
  avgManaValue: "avg_mana_value",
}

// CardScatterAxes are the measures the Cards scatter plot can put on an axis.
// needs lists the data a measure is built from, so a cube without it doesn't
// offer it.
export const CardScatterAxes = [
  {label: CARDS_COPY.scatter.axisNumDecks, value: CardAxis.numDecks},
  {label: CARDS_COPY.scatter.axisNumSideboard, value: CardAxis.numSideboard, needs: ["sideboards"]},
  {label: CARDS_COPY.scatter.axisMainboardPercent, value: CardAxis.mainboardPercent, needs: ["sideboards"]},
  {label: CARDS_COPY.scatter.axisSideboardPercent, value: CardAxis.sideboardPercent, needs: ["sideboards"]},
  {label: CARDS_COPY.scatter.axisWinPercent, value: CardAxis.winPercent, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisWinPercentVsAvg, value: CardAxis.winPercentVsAvg, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisPercentOfWins, value: CardAxis.percentOfWins, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisNumWins, value: CardAxis.numWins, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisExpectedWinPercent, value: CardAxis.expectedWinPercent, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisPickElo, value: CardAxis.pickElo, needs: ["sideboards"]},
  {label: CARDS_COPY.scatter.axisMatchElo, value: CardAxis.matchElo, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisNumGames, value: CardAxis.numGames, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisManaValue, value: CardAxis.manaValue},
  {label: CARDS_COPY.scatter.axisNumPlayers, value: CardAxis.numPlayers},
  {label: CARDS_COPY.scatter.axisDraftPick, value: CardAxis.draftPick, needs: ["pick_logs"]},
  {label: CARDS_COPY.scatter.axisNumTrophies, value: CardAxis.numTrophies, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisNumLastPlace, value: CardAxis.numLastPlace, needs: ["results"]},
  {label: CARDS_COPY.scatter.axisVsAggro, value: CardAxis.vsAggro, needs: ["results", "archetypes"]},
  {label: CARDS_COPY.scatter.axisVsControl, value: CardAxis.vsControl, needs: ["results", "archetypes"]},
  {label: CARDS_COPY.scatter.axisVsMidrange, value: CardAxis.vsMidrange, needs: ["results", "archetypes"]},
  {label: CARDS_COPY.scatter.axisInAggro, value: CardAxis.inAggro, needs: ["results", "archetypes"]},
  {label: CARDS_COPY.scatter.axisInControl, value: CardAxis.inControl, needs: ["results", "archetypes"]},
  {label: CARDS_COPY.scatter.axisInMidrange, value: CardAxis.inMidrange, needs: ["results", "archetypes"]},
  {label: CARDS_COPY.scatter.axisWordCount, value: CardAxis.wordCount},
]

// DeckScatterAxes are the measures the Deck stats scatter plot can put on an axis.
export const DeckScatterAxes = [
  {label: DECKSTATS_COPY.scatter.axisInteraction, value: DeckAxis.interaction},
  {label: DECKSTATS_COPY.scatter.axisCreatures, value: DeckAxis.creatures},
  {label: DECKSTATS_COPY.scatter.axisWinPercent, value: DeckAxis.winPercent, needs: ["results"]},
  {label: DECKSTATS_COPY.scatter.axisAvgManaValue, value: DeckAxis.avgManaValue},
]

// The axes each scatter plot opens with.
export const DEFAULT_CARD_X_AXIS = CardAxis.numDecks
export const DEFAULT_CARD_Y_AXIS = CardAxis.pickElo
export const DEFAULT_DECK_X_AXIS = DeckAxis.creatures
export const DEFAULT_DECK_Y_AXIS = DeckAxis.interaction

// axisLabel returns the display label for an axis value in one of the axes
// lists, or the value itself when the list doesn't have it.
export function axisLabel(axes, value) {
  for (const axis of axes) {
    if (axis.value === value) {
      return axis.label
    }
  }
  return value
}
