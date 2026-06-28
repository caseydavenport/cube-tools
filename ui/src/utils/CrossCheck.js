import { isBasic } from './Reconcile.js';

// totalBasics sums a name->count basics map.
function totalBasics(basics) {
  return basics ? Object.values(basics).reduce((s, n) => s + n, 0) : 0;
}

// poolWarnings flags a pool that isn't the expected 45 cards.
function poolWarnings(pool) {
  const total = pool.reduce((s, e) => s + e.count, 0);
  const w = [];
  if (total !== 45) w.push(`Pool has ${total} cards (expected 45)`);
  return w;
}

// previewSideboard returns what's left of the pool once the mainboard is
// removed - the implied sideboard. Basics played in the deck don't count
// against the pool.
export function previewSideboard(pool, mainboard) {
  const played = {};
  mainboard.forEach(e => { if (!isBasic(e.card_name)) played[e.card_name] = (played[e.card_name] || 0) + e.count; });
  const side = [];
  pool.forEach(e => {
    const remaining = e.count - (played[e.card_name] || 0);
    if (remaining > 0) side.push({ card_name: e.card_name, count: remaining });
  });
  return side;
}

// mainboardWarnings flags deck cards that are missing from the pool or exceed
// their pool count, plus a mainboard outside the ~40-card range.
function mainboardWarnings(pool, mainboard, basics) {
  const poolCounts = {};
  pool.forEach(e => { poolCounts[e.card_name] = e.count; });
  const w = [];
  mainboard.forEach(e => {
    if (isBasic(e.card_name)) return;
    if (!poolCounts[e.card_name]) w.push(`"${e.card_name}" is in the deck but not the pool`);
    else if (e.count > poolCounts[e.card_name]) w.push(`"${e.card_name}" x${e.count} exceeds pool (${poolCounts[e.card_name]})`);
  });
  const draftedCards = mainboard.reduce((s, e) => s + e.count, 0);
  const size = draftedCards + totalBasics(basics);
  if (size > 0 && (size < 38 || size > 46)) w.push(`Mainboard has ${size} cards (expected ~40)`);
  return w;
}

// allWarnings aggregates every check across the pool and deck so the same list
// shows on every tab; fixing a deck warning often means editing the pool.
export function allWarnings(pool, mainboard, basics) {
  return [...poolWarnings(pool), ...mainboardWarnings(pool, mainboard, basics)];
}

// mainboardBreakdown reports cards / lands / basics for the deck. Lands counts
// non-basic lands (via the card's is_land flag) plus every basic.
export function mainboardBreakdown(mainboard, basics, cardsByName) {
  const basicLands = totalBasics(basics);
  let draftedCards = 0, nonBasicLands = 0;
  mainboard.forEach(e => {
    if (isBasic(e.card_name)) return;
    draftedCards += e.count;
    if (cardsByName[e.card_name] && cardsByName[e.card_name].is_land) nonBasicLands += e.count;
  });
  return {
    cards: draftedCards + basicLands,
    lands: nonBasicLands + basicLands,
    basics: basicLands,
  };
}
