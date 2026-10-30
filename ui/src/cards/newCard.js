// When a card counts as new to the cube, shared by the Cards table and the
// card page.

// NEW_CARD_DRAFTS is how many drafts a card needs before its numbers are
// trusted. Cards seen in fewer drafts are marked new.
export const NEW_CARD_DRAFTS = 5

// isNewCard reports whether a card has been in too few drafts to compare
// fairly against the rest of the cube.
export function isNewCard(drafts) {
  return drafts < NEW_CARD_DRAFTS
}
