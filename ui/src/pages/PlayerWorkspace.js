import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhotoViewer } from './PhotoViewer.js';
import { PoolList, Snippet, Autocomplete } from './PoolList.js';
import { deriveList, boxCountByName, unmatchedRows, basicCountsInBoxes, resolvedCaptures } from '../utils/Reconcile.js';
import { DetectPhoto, LoadOCRCards, LoadOCRSession, SaveOCRSession, MatchRegion, ConfirmPlayer, RotatePhoto } from '../utils/OCRFetch.js';
import { allWarnings, previewSideboard, mainboardBreakdown } from '../utils/CrossCheck.js';

// PlayerWorkspace is the per-player OCR screen: reconcile the detected pool and
// deck against the photos across the pool/deck/confirm tabs, then write the deck.
export function PlayerWorkspace({ cube, draft, player, onConfirmed }) {
  const poolPhotos = [...(player.photos.checkin || []), ...(player.photos.checkout || [])];
  const deckPhotos = player.photos.deck || [];

  // Detection state, keyed by photo: boxes/deckBoxes hold the pool and deck
  // detection boxes; overrides/deckOverrides hold absolute manual counts that
  // win over the derived list.
  const [boxes, setBoxes] = useState({});
  const [deckBoxes, setDeckBoxes] = useState({});
  const [overrides, setOverrides] = useState({});
  const [deckOverrides, setDeckOverrides] = useState({});
  const [basics, setBasics] = useState({});
  const [cards, setCards] = useState([]);

  // stage is the active tab: pool, deck, or confirm.
  const [stage, setStage] = useState("pool");
  const [currentPhoto, setCurrentPhoto] = useState(poolPhotos[0] || null);
  const [deckPhoto, setDeckPhoto] = useState(deckPhotos[0] || null);
  const [hoveredName, setHoveredName] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [redetecting, setRedetecting] = useState(false);

  // photoVersions maps a photo to a cache-bust counter, bumped on rotate so the
  // browser reloads the rewritten file.
  const [photoVersions, setPhotoVersions] = useState({});

  const bust = photo => photoVersions[photo] || 0;

  const idRef = useRef(0);
  const nextId = () => `m${++idRef.current}`;

  const cardsByName = React.useMemo(() => {
    const m = {}; cards.forEach(c => { m[c.name] = c; }); return m;
  }, [cards]);

  const pool = React.useMemo(() => deriveList(boxes, overrides), [boxes, overrides]);
  const mainboard = React.useMemo(() => deriveList(deckBoxes, deckOverrides), [deckBoxes, deckOverrides]);
  const poolUnmatched = React.useMemo(() => unmatchedRows(boxes), [boxes]);
  const deckUnmatched = React.useMemo(() => unmatchedRows(deckBoxes), [deckBoxes]);
  const boxCount = React.useMemo(() => boxCountByName(boxes), [boxes]);
  const deckBoxCount = React.useMemo(() => boxCountByName(deckBoxes), [deckBoxes]);
  const mainCount = React.useMemo(() => {
    const m = {}; mainboard.forEach(e => { m[e.card_name] = e.count; }); return m;
  }, [mainboard]);
  const poolCaptures = React.useMemo(() => resolvedCaptures(boxes), [boxes]);
  const deckCaptures = React.useMemo(() => resolvedCaptures(deckBoxes), [deckBoxes]);

  // One sequence for the confirm slideshow, tagged with which list each capture
  // belongs to so a correction routes back to the right box.
  const confirmCaptures = React.useMemo(() => [
    ...poolCaptures.map(c => ({ ...c, group: "Pool" })),
    ...deckCaptures.map(c => ({ ...c, group: "Mainboard" })),
  ], [poolCaptures, deckCaptures]);

  const warnings = allWarnings(pool, mainboard, basics);
  const breakdown = mainboardBreakdown(mainboard, basics, cardsByName);

  // Load cards + saved session once.
  useEffect(() => {
    LoadOCRCards(cube, draft.draft_id).then(setCards);
    LoadOCRSession(cube, draft.draft_id).then(s => {
      const pw = s.players && s.players[player.id];
      if (pw) {
        // Dedupe by id: a box id is unique per box, so two entries sharing one
        // are the same box stored twice. They would collide on React's key and
        // only render once (and double-count in the derived list).
        const pb = dedupeBoxes(pw.boxes);
        const db = dedupeBoxes(pw.deck_boxes);
        setBoxes(pb);
        setDeckBoxes(db);
        setOverrides(pw.overrides || {});
        setDeckOverrides(pw.deck_overrides || {});
        setBasics(pw.basics || {});

        // Resume the manual-id counter above the highest loaded id so newly
        // drawn boxes can't reuse an id already in the session.
        idRef.current = maxManualId(pb, db);
      }
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube, draft.draft_id, player.id]);

  // Photos are scanned on demand (the "Scan photo" button), not automatically,
  // so the operator can rotate a photo into the right orientation before OCR
  // runs on it. See applyDetection / redetect below.

  // Debounced autosave.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      SaveOCRSession(cube, draft.draft_id, {
        draft_id: draft.draft_id,
        players: { [player.id]: {
          status: "in_progress",
          boxes, deck_boxes: deckBoxes, overrides, deck_overrides: deckOverrides, basics,
          pool_entries: pool, mainboard_entries: mainboard,
        } },
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, deckBoxes, overrides, deckOverrides, basics]);

  // makeBoxOps builds the add/resize/delete/rename operations for one box map.
  // It takes the state setter so the pool and deck photos share one
  // implementation (poolOps and deckOps below). add and resize re-run region
  // matching; setName resolves a box by hand.
  function makeBoxOps(setMap) {
    function patch(map, photo, id, p) {
      return { ...map, [photo]: (map[photo] || []).map(b => b.id === id ? { ...b, ...p } : b) };
    }
    async function rematch(photo, id, bbox) {
      try {
        const line = await MatchRegion(cube, photo, bbox);
        setMap(prev => patch(prev, photo, id, {
          status: line.confidence_band, chosen: line.chosen || "",
          candidates: line.candidates || [], bbox: line.bbox || bbox,
        }));
      } catch {
        setMap(prev => patch(prev, photo, id, { status: "unmatched" }));
      }
    }
    return {
      add(photo, bbox) {
        const id = `${photo}:${nextId()}`;
        setMap(prev => ({ ...prev, [photo]: [...(prev[photo] || []), { id, bbox, status: "pending", chosen: "", candidates: [] }] }));
        rematch(photo, id, bbox);
      },
      resize(photo, id, bbox) {
        setMap(prev => patch(prev, photo, id, { bbox, status: "pending" }));
        rematch(photo, id, bbox);
      },
      del(photo, id) {
        setMap(prev => ({ ...prev, [photo]: (prev[photo] || []).filter(b => b.id !== id) }));
      },

      // setName resolves one box by hand, used to fill in an unmatched (red)
      // detection. We mark it "high" so it counts and moves into the normal
      // list - the operator picked it, so we trust it.
      setName(photo, id, name) {
        setMap(prev => patch(prev, photo, id, { chosen: name, status: "high" }));
      },
    };
  }
  const poolOps = React.useMemo(() => makeBoxOps(setBoxes), []);
  const deckOps = React.useMemo(() => makeBoxOps(setDeckBoxes), []);

  // applyDetection runs detection for one photo and replaces its boxes. For a
  // deck photo it also reconciles the basics control: back out what the old
  // boxes contributed, then add the fresh detection (basics are seeded from
  // detected basic lands).
  function applyDetection(setMap, photo, existing) {
    return DetectPhoto(cube, photo).then(lines => {
      const detected = linesToBoxes(photo, lines);
      setMap(prev => ({ ...prev, [photo]: detected }));
      if (setMap === setDeckBoxes) {
        setBasics(prev => addBasics(
          addBasics(prev, basicCountsInBoxes(existing), -1),
          basicCountsInBoxes(detected),
        ));
      }
    });
  }

  // Scan one photo, replacing its boxes. This is the explicit "Scan photo"
  // action: photos aren't scanned automatically, so the operator can rotate
  // first. Prompts before discarding existing boxes on a re-scan.
  function redetect(setMap, photo, existing) {
    if (!photo || redetecting) return;
    if ((existing || []).length > 0 &&
      !window.confirm("Re-run detection? This replaces the current boxes for this photo.")) return;
    setRedetecting(true);
    applyDetection(setMap, photo, existing).catch(() => {}).finally(() => setRedetecting(false));
  }

  // Rotate a photo 90 degrees in place. Rotation changes the file on disk, so
  // any existing boxes (old orientation) are stale: drop them and bump the
  // cache-bust version to reload the image. We don't scan here - the operator
  // rotates into the right orientation, then presses "Scan photo".
  function rotate(setMap, photo, existing, dir) {
    if (!photo || redetecting) return;
    setRedetecting(true);
    RotatePhoto(cube, photo, dir)
      .then(() => {
        setPhotoVersions(prev => ({ ...prev, [photo]: (prev[photo] || 0) + 1 }));
        setMap(prev => ({ ...prev, [photo]: [] }));
        if (setMap === setDeckBoxes) {
          setBasics(prev => addBasics(prev, basicCountsInBoxes(existing), -1));
        }
      })
      .catch(() => {})
      .finally(() => setRedetecting(false));
  }

  // Clear all detections from one photo without rotating or rescanning. Like
  // rotate, a deck photo backs its old boxes out of the basics count.
  function clearPhoto(setMap, photo, existing) {
    if (!photo || !(existing || []).length) return;
    if (!window.confirm("Clear all detections from this photo?")) return;
    setMap(prev => ({ ...prev, [photo]: [] }));
    if (setMap === setDeckBoxes) {
      setBasics(prev => addBasics(prev, basicCountsInBoxes(existing), -1));
    }
  }

  // listOps builds the count edits for a derived list (pool or mainboard) over
  // its box map and override map. Overrides hold the absolute count the operator
  // wants, so setCount is a plain assignment, not a delta against the box count.
  function listOps(setMap, setOverrideMap, baseCount) {
    return {
      setCount(name, n) { setOverrideMap(prev => ({ ...prev, [name]: n })); },
      add(name) {
        setOverrideMap(prev => {
          const cur = name in prev ? prev[name] : (baseCount[name] || 0);
          return { ...prev, [name]: cur + 1 };
        });
      },
      remove(name) {
        setMap(prev => {
          const next = {}; Object.entries(prev).forEach(([p, bs]) => { next[p] = bs.filter(b => b.chosen !== name); }); return next;
        });
        setOverrideMap(prev => { const next = { ...prev }; delete next[name]; return next; });
      },
      changeName(oldName, newName) {
        setMap(prev => {
          const next = {}; Object.entries(prev).forEach(([p, bs]) => { next[p] = bs.map(b => b.chosen === oldName ? { ...b, chosen: newName } : b); }); return next;
        });
        setOverrideMap(prev => {
          if (!(oldName in prev)) return prev;
          const next = { ...prev }; next[newName] = next[oldName]; delete next[oldName]; return next;
        });
      },
    };
  }
  const poolList = listOps(setBoxes, setOverrides, boxCount);
  const deckList = listOps(setDeckBoxes, setDeckOverrides, deckBoxCount);
  const setDeckCount = (name, n) => setDeckOverrides(prev => ({ ...prev, [name]: n }));

  // Reassign one capture's card from the confirm slideshow. Routes to the box's
  // own list (pool vs deck) by the group tag and resolves it by hand (status
  // "high"), same as picking a name on the pool/deck tabs.
  function correctCapture(cap, name) {
    const ops = cap.group === "Pool" ? poolOps : deckOps;
    ops.setName(cap.photo, cap.key, name);
  }

  async function confirm() {
    const toCounted = es => es.map(e => ({ name: e.card_name, count: e.count }));
    const payload = mainboard.length > 0 || Object.values(basics).some(n => n > 0)
      ? { pool: toCounted(pool), mainboard: toCounted(mainboard), basics }
      : { pool: toCounted(pool) };
    await ConfirmPlayer(cube, draft.draft_id, player.id, payload);
    // Let the parent reload the draft (so this player turns green) and drop back
    // to the players list.
    if (onConfirmed) await onConfirmed();
  }

  return (
    <div className="ocr-workspace">
      <div className="ocr-tabs">
        {["pool", "deck", "confirm"].map(s => (
          <button key={s} className={stage === s ? "active" : ""} onClick={() => setStage(s)}>{s}</button>
        ))}
      </div>

      <Warnings items={warnings} />

      {stage === "pool" && (
        <>
          <div className="ocr-cols">
            <div className="ocr-left">
              {currentPhoto && <PhotoViewer cube={cube} photo={currentPhoto} photos={poolPhotos} onSelectPhoto={setCurrentPhoto}
                boxes={boxes[currentPhoto]} hoveredName={hoveredName} setHoveredName={setHoveredName}
                onDrawBox={b => poolOps.add(currentPhoto, b)}
                onResizeBox={(id, b) => poolOps.resize(currentPhoto, id, b)}
                onDeleteBox={id => poolOps.del(currentPhoto, id)}
                onRedetect={() => redetect(setBoxes, currentPhoto, boxes[currentPhoto])}
                onRotate={dir => rotate(setBoxes, currentPhoto, boxes[currentPhoto], dir)}
                onClear={() => clearPhoto(setBoxes, currentPhoto, boxes[currentPhoto])}
                detecting={redetecting} bust={bust} />}
            </div>
            <div className="ocr-right">
              <PoolList title="Pool" entries={pool} cards={cards} target={45} cube={cube} bust={bust}
                hoveredName={hoveredName} setHoveredName={setHoveredName}
                onSetCount={poolList.setCount} onRemove={poolList.remove}
                onChangeName={poolList.changeName} onAdd={poolList.add}
                unmatched={poolUnmatched} onFillName={poolOps.setName} onRemoveBox={poolOps.del}
                basics={basics} onSetBasic={(b, n) => setBasics(prev => ({ ...prev, [b]: n }))} />
            </div>
          </div>
        </>
      )}

      {stage === "deck" && (
        <div className="ocr-cols">
          <div className="ocr-left">
            {deckPhoto && <PhotoViewer cube={cube} photo={deckPhoto} photos={deckPhotos} onSelectPhoto={setDeckPhoto}
              boxes={deckBoxes[deckPhoto]} hoveredName={hoveredName} setHoveredName={setHoveredName}
              onDrawBox={b => deckOps.add(deckPhoto, b)}
              onResizeBox={(id, b) => deckOps.resize(deckPhoto, id, b)}
              onDeleteBox={id => deckOps.del(deckPhoto, id)}
              onRedetect={() => redetect(setDeckBoxes, deckPhoto, deckBoxes[deckPhoto])}
              onRotate={dir => rotate(setDeckBoxes, deckPhoto, deckBoxes[deckPhoto], dir)}
              onClear={() => clearPhoto(setDeckBoxes, deckPhoto, deckBoxes[deckPhoto])}
              detecting={redetecting} bust={bust} />}
          </div>
          <div className="ocr-right">
            <PoolList title="Mainboard" entries={mainboard} cards={cards} breakdown={breakdown} cube={cube} bust={bust}
              hoveredName={hoveredName} setHoveredName={setHoveredName}
              onSetCount={deckList.setCount} onRemove={deckList.remove}
              onChangeName={deckList.changeName} onAdd={deckList.add}
              unmatched={deckUnmatched} onFillName={deckOps.setName} onRemoveBox={deckOps.del}
              onMove={name => setDeckCount(name, (mainCount[name] || 1) - 1)} moveLabel="→ SB"
              basics={basics} onSetBasic={(b, n) => setBasics(prev => ({ ...prev, [b]: n }))} />
            <SideboardPreview side={previewSideboard(pool, mainboard)}
              hoveredName={hoveredName} setHoveredName={setHoveredName}
              onMove={name => setDeckCount(name, (mainCount[name] || 0) + 1)} />
          </div>
        </div>
      )}

      {stage === "confirm" && (
        <div className="ocr-confirm">
          <p>Pool: {pool.reduce((s, e) => s + e.count, 0)} cards. Mainboard: {breakdown.cards} ({breakdown.lands} lands, {breakdown.basics} basics).</p>
          <ConfirmSlideshow captures={confirmCaptures} cards={cards} cube={cube} bust={bust} onCorrect={correctCapture} />
          <button className="ocr-confirm-btn" onClick={confirm}>Confirm &amp; write deck</button>
        </div>
      )}
    </div>
  );
}

// dedupeBoxes drops repeat ids within each photo's box list, keeping the first.
function dedupeBoxes(boxesMap) {
  const out = {};
  Object.entries(boxesMap || {}).forEach(([photo, boxes]) => {
    const seen = new Set();
    out[photo] = (boxes || []).filter(b => seen.has(b.id) ? false : (seen.add(b.id), true));
  });
  return out;
}

// maxManualId finds the largest manual-box counter ("...:m<N>") across the
// given box maps, so the id counter can resume above it.
function maxManualId(...boxesMaps) {
  let max = 0;
  boxesMaps.forEach(map => Object.values(map || {}).forEach(boxes =>
    (boxes || []).forEach(b => {
      const m = /:m(\d+)$/.exec(b.id || "");
      if (m) max = Math.max(max, +m[1]);
    })));
  return max;
}

// addBasics merges a {name: count} delta into the basics map, clamped at 0.
// sign=-1 backs a contribution out (used when re-detecting a photo).
function addBasics(prev, delta, sign = 1) {
  const next = { ...prev };
  Object.entries(delta).forEach(([name, n]) => {
    next[name] = Math.max(0, (next[name] || 0) + sign * n);
  });
  return next;
}

function linesToBoxes(photo, lines) {
  return (lines || []).map((ln, i) => ({
    id: `${photo}:${i}`, bbox: ln.bbox, status: ln.confidence_band,
    chosen: ln.chosen || "", candidates: ln.candidates || [],
  }));
}

// Big crop for the confirm-page check so a wrong name next to its capture is
// obvious. The snippet is a wide, short strip (the nameplate), so width carries
// the legibility.
const SLIDE_SNIP_W = 620, SLIDE_SNIP_H = 150;

// ConfirmSlideshow steps through every resolved capture one at a time as a final
// check before writing the deck. Accept (✓ / Enter / →) advances; reject (✗ /
// ↓) opens an inline correction (candidate quick-picks + a name search) that
// reassigns the card and advances. ← steps back, Esc closes a correction.
function ConfirmSlideshow({ captures, cards, cube, bust, onCorrect }) {
  const [idx, setIdx] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  const total = captures.length;
  const done = idx >= total;

  // Reset only when the set of captures changes size (e.g. a re-scan), not on
  // every correction (those keep the same count and we advance by hand).
  useEffect(() => { setIdx(0); setCorrecting(false); }, [total]);

  const accept = useCallback(() => { setCorrecting(false); setIdx(i => i + 1); }, []);
  const back = useCallback(() => { setCorrecting(false); setIdx(i => Math.max(i - 1, 0)); }, []);

  useEffect(() => {
    if (done) return;
    function onKey(e) {
      // The correction field owns the keyboard while focused.
      if (e.target.tagName === "INPUT") return;
      if (correcting) { if (e.key === "Escape") { e.preventDefault(); setCorrecting(false); } return; }
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); accept(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setCorrecting(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, correcting, accept, back]);

  if (total === 0) return null;

  if (done) {
    return (
      <div className="ocr-slideshow ocr-slideshow-done">
        <p>Reviewed all {total} captures.</p>
        <button onClick={() => setIdx(0)}>Review again</button>
      </div>
    );
  }

  const cap = captures[idx];
  const correct = name => { onCorrect(cap, name); setCorrecting(false); setIdx(i => i + 1); };
  const cand = (cap.candidates || []).filter(c => c.name !== cap.chosen).slice(0, 3);

  return (
    <div className="ocr-slideshow">
      <div className="ocr-slide-progress">{idx + 1} / {total} · {cap.group}</div>
      <Snippet cube={cube} source={cap.source} bust={bust} w={SLIDE_SNIP_W} h={SLIDE_SNIP_H} />
      <div className="ocr-slide-name">{cap.chosen}</div>
      <div className="ocr-slide-actions">
        <button className="ocr-slide-yes" onClick={accept} title="Looks right (Enter)">✓</button>
        <button className="ocr-slide-no" onClick={() => setCorrecting(true)} title="Wrong — fix it (↓)">✗</button>
      </div>
      {correcting ? (
        <div className="ocr-slide-fix">
          {cand.length > 0 && (
            <div className="ocr-cand">
              {cand.map(c => (
                <button key={c.name} onClick={() => correct(c.name)}>
                  {c.name}{c.score != null ? ` (${c.score.toFixed(2)})` : ""}
                </button>
              ))}
            </div>
          )}
          <Autocomplete cards={cards} onPick={correct} placeholder="name this card…" autoFocus />
        </div>
      ) : (
        <div className="ocr-slide-hint">Enter accept · ← back · ↓ fix</div>
      )}
    </div>
  );
}

function Warnings({ items }) {
  if (!items || items.length === 0) return null;
  return <ul className="ocr-warnings">{items.map((w, i) => <li key={i}>{w}</li>)}</ul>;
}

function SideboardPreview({ side, hoveredName, setHoveredName, onMove }) {
  return (
    <div className="ocr-sideboard">
      <h4>Sideboard (derived, {side.reduce((s, e) => s + e.count, 0)})</h4>
      <ul>
        {side.map(e => (
          <li key={e.card_name} className={e.card_name === hoveredName ? "hot" : ""}
            onMouseEnter={() => setHoveredName(e.card_name)} onMouseLeave={() => setHoveredName(null)}>
            <span>{e.count} {e.card_name}</span>
            <button className="ocr-move" onClick={() => onMove(e.card_name)}>→ MB</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
