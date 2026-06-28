const BASICS = new Set([
  "Plains","Island","Swamp","Mountain","Forest","Wastes",
  "Snow-Covered Plains","Snow-Covered Island","Snow-Covered Swamp",
  "Snow-Covered Mountain","Snow-Covered Forest","Snow-Covered Wastes",
]);

// isBasic reports whether name is a basic land.
export function isBasic(name) { return BASICS.has(name); }

// resolves reports whether a box counts toward the derived list: it has a
// settled, non-basic name (not pending or unmatched). Basics are entered
// through their own control, not from boxes.
function resolves(box) {
  return box.chosen && !isBasic(box.chosen) &&
    box.status !== "pending" && box.status !== "unmatched";
}

// basicCountsInBoxes tallies the basic-land boxes in one photo. Basics stay out
// of the derived list, but this seeds the basics control from detection (the
// caller sums across a player's deck photos).
export function basicCountsInBoxes(boxes) {
  const counts = {};
  (boxes || []).forEach(b => {
    if (!b.chosen || !isBasic(b.chosen)) return;
    if (b.status === "pending" || b.status === "unmatched") return;
    counts[b.chosen] = (counts[b.chosen] || 0) + 1;
  });
  return counts;
}

// boxCountByName collapses a photo->boxes map into name->count. A card appears
// in both the check-in and check-out shots, so summing across photos would
// double it - take the max instead. Two boxes of one card within a single photo
// is a real 2x.
export function boxCountByName(boxesMap) {
  const perPhoto = {}; // name -> { photo -> count }
  Object.entries(boxesMap || {}).forEach(([photo, boxes]) => {
    (boxes || []).forEach(b => {
      if (!resolves(b)) return;
      perPhoto[b.chosen] = perPhoto[b.chosen] || {};
      perPhoto[b.chosen][photo] = (perPhoto[b.chosen][photo] || 0) + 1;
    });
  });
  const counts = {};
  Object.entries(perPhoto).forEach(([name, photos]) => {
    counts[name] = Math.max(...Object.values(photos));
  });
  return counts;
}

// deriveList builds the displayed list from the boxes plus the manual overrides
// map. An override is the absolute count the operator wants, not a delta, so
// re-running detection can't silently shift a hand-set count. Cards added by
// hand (no box) live purely in overrides; each row borrows a representative
// box's source + candidates so the UI can offer corrections.
export function deriveList(boxesMap, overrides) {
  const counts = boxCountByName(boxesMap);
  Object.entries(overrides || {}).forEach(([name, n]) => {
    counts[name] = n;
  });

  // First box per name supplies candidates + source + confidence for the row.
  const repr = {};
  Object.entries(boxesMap || {}).forEach(([photo, boxes]) => {
    (boxes || []).forEach(b => {
      if (!b.chosen || repr[b.chosen]) return;
      const cand = (b.candidates || []).find(c => c.name === b.chosen);
      repr[b.chosen] = {
        source: { photo, box: b.bbox }, candidates: b.candidates || [],
        status: b.status, score: cand ? cand.score : undefined,
      };
    });
  });

  const entries = [];
  Object.entries(counts).forEach(([name, count]) => {
    if (count <= 0) return;
    const r = repr[name] || { source: { photo: "", box: {} }, candidates: [] };
    entries.push({
      card_name: name, count, source: r.source, candidates: r.candidates,
      status: r.status, score: r.score,
    });
  });
  entries.sort((a, b) => a.card_name.localeCompare(b.card_name));
  return entries;
}

// resolvedCaptures flattens the boxes into one item per resolved box for the
// final confirmation grid. Unlike deriveList it doesn't collapse by name or
// dedupe across photos - every capture shows on its own (check-in and check-out
// both) so a crop that doesn't match its name is easy to spot. Ordered by
// photo, then top-to-bottom and left-to-right within a photo.
export function resolvedCaptures(boxesMap) {
  const items = [];
  Object.entries(boxesMap || {}).forEach(([photo, boxes]) => {
    (boxes || []).forEach(b => {
      if (!b.chosen || b.status === "pending" || b.status === "unmatched") return;
      items.push({ key: b.id, photo, source: { photo, box: b.bbox }, chosen: b.chosen, status: b.status });
    });
  });
  items.sort((a, b) =>
    a.photo.localeCompare(b.photo) ||
    (a.source.box.Y || 0) - (b.source.box.Y || 0) ||
    (a.source.box.X || 0) - (b.source.box.X || 0));
  return items;
}

// unmatchedRows surfaces each box OCR couldn't resolve so the operator can fill
// it in by hand. Kept out of deriveList (which only carries resolved cards) and
// keyed by box id, since every unmatched box shares the same empty name.
export function unmatchedRows(boxesMap) {
  const rows = [];
  Object.entries(boxesMap || {}).forEach(([photo, boxes]) => {
    (boxes || []).forEach(b => {
      if (b.status !== "unmatched") return;
      rows.push({
        boxId: b.id, photo,
        source: { photo, box: b.bbox },
        candidates: b.candidates || [],
        status: b.status,
      });
    });
  });
  return rows;
}
