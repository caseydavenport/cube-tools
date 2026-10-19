import { isBasic } from './Reconcile.js';

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
