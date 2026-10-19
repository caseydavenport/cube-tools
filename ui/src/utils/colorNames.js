// Names for Magic color identities. Kept free of imports so node tests can load it.

// WUBRG is the five colors in the order Magic lists them.
export const WUBRG = ["W", "U", "B", "R", "G"]

// COLOR_NAMES maps a color identity, written in WUBRG order, to its name: the
// five colors, the ten two-color guilds, and the ten three-color shards and wedges.
const COLOR_NAMES = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",

  WU: "Azorius",
  WB: "Orzhov",
  WR: "Boros",
  WG: "Selesnya",
  UB: "Dimir",
  UR: "Izzet",
  UG: "Simic",
  BR: "Rakdos",
  BG: "Golgari",
  RG: "Gruul",

  WUB: "Esper",
  WUR: "Jeskai",
  WUG: "Bant",
  WBR: "Mardu",
  WBG: "Abzan",
  WRG: "Naya",
  UBR: "Grixis",
  UBG: "Sultai",
  URG: "Temur",
  BRG: "Jund",
}

// colorName returns the name for a color identity like "BG" (Golgari), or the
// identity itself when it has no name, such as four or five colors.
export function colorName(identity) {
  if (identity in COLOR_NAMES) {
    return COLOR_NAMES[identity]
  }
  return identity
}
