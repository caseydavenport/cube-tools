import React, { useCallback, useEffect, useState } from 'react';
import { useCube } from '../contexts/CubeContext.js';
import { LoadOCRDrafts, LoadOCRDraft, StartDraftScan, GetDraftScan, LoadOCRConsistency, LoadOCRCards, LoadOCRSession, SaveOCRSession } from '../utils/OCRFetch.js';
import { Snippet, Autocomplete } from './PoolList.js';
import { deriveList } from '../utils/Reconcile.js';
import { PlayerWorkspace } from './PlayerWorkspace.js';

// OCRImport is the top-level OCR screen. It walks three views: pick a draft,
// then a player (with the scan-all control and the pool-vs-cube consistency
// check), then that player's reconciliation workspace.
export default function OCRImport({ initialDraftId }) {
  const cube = useCube();

  // drafts is the list view; draft is the open DraftDetail; playerId selects a
  // player within it. scan tracks the background photo scan, consistency the
  // pool-vs-cube check, and cards the cube list used for rename search.
  const [drafts, setDrafts] = useState([]);
  const [draft, setDraft] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [scan, setScan] = useState(null);
  const [consistency, setConsistency] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => { LoadOCRDrafts(cube).then(setDrafts); }, [cube]);

  // Coming from the Hedron import, open the freshly-created draft directly
  // instead of the list.
  useEffect(() => {
    if (initialDraftId) openDraft(initialDraftId);
  }, [cube, initialDraftId]);

  // Recompute the pool-vs-cube consistency check. Called when the open draft
  // changes (including the reload after a scan finishes) and after each fix.
  const reloadConsistency = useCallback(() => {
    if (!draft) return Promise.resolve();
    return LoadOCRConsistency(cube, draft.draft_id)
      .then(setConsistency)
      .catch(() => setConsistency(null));
  }, [cube, draft]);

  useEffect(() => {
    if (!draft) { setConsistency(null); setCards([]); return; }
    let alive = true;
    LoadOCRConsistency(cube, draft.draft_id)
      .then(c => { if (alive) setConsistency(c); })
      .catch(() => { if (alive) setConsistency(null); });
    LoadOCRCards(cube, draft.draft_id).then(c => { if (alive) setCards(c); });
    return () => { alive = false; };
  }, [cube, draft]);

  // Pick up any scan already running for this draft (e.g. started before a
  // reload) so the progress UI reflects it.
  useEffect(() => {
    if (!draft) { setScan(null); return; }
    let alive = true;
    GetDraftScan(cube, draft.draft_id).then(s => { if (alive) setScan(s); });
    return () => { alive = false; };
  }, [cube, draft]);

  // While a scan runs, poll for progress. When it finishes, reload the draft so
  // the per-player status dots reflect the freshly scanned boxes.
  useEffect(() => {
    if (!draft || !scan || scan.state !== "running") return;
    const t = setTimeout(async () => {
      const s = await GetDraftScan(cube, draft.draft_id);
      setScan(s);
      if (s.state !== "running") setDraft(await LoadOCRDraft(cube, draft.draft_id));
    }, 1500);
    return () => clearTimeout(t);
  }, [cube, draft, scan]);

  async function openDraft(id) {
    const d = await LoadOCRDraft(cube, id);
    setDraft(d);
    setPlayerId(null);
  }

  async function startScan() {
    setScan(await StartDraftScan(cube, draft.draft_id));
  }

  if (draft && playerId) {
    const player = draft.players.find(p => p.id === playerId);
    return (
      <div className="ocr-import wide">
        <button className="ocr-back" onClick={() => setPlayerId(null)}>&larr; Players</button>
        <PlayerWorkspace cube={cube} draft={draft} player={player} />
      </div>
    );
  }

  if (draft) {
    return (
      <div className="ocr-import">
        <button className="ocr-back" onClick={() => setDraft(null)}>&larr; Drafts</button>
        <h2 className="ocr-title">
          {draft.event_name || draft.draft_id}
          {draft.flight && <span className="ocr-title-flight">{draft.flight}</span>}
        </h2>
        <div className="ocr-scan-bar">
          <button className="ocr-scan-all" onClick={startScan} disabled={scan && scan.state === "running"}>
            {scan && scan.state === "running" ? "Scanning…" : "Scan all photos"}
          </button>
          {scan && scan.state === "running" && (
            <span className="ocr-scan-progress">
              <span className="ocr-scan-bar-track">
                <span className="ocr-scan-bar-fill" style={{ width: `${scan.total ? (scan.done / scan.total) * 100 : 0}%` }} />
              </span>
              {scan.done}/{scan.total}{scan.current ? ` · ${scan.current.split("/").pop()}` : ""}
            </span>
          )}
          {scan && scan.state === "done" && scan.total > 0 && (
            <span className="ocr-scan-progress">Scanned {scan.total} photo{scan.total === 1 ? "" : "s"}</span>
          )}
          {scan && scan.error && <span className="ocr-scan-error">some photos failed: {scan.error}</span>}
        </div>
        {consistency && (
          <ConsistencyPanel report={consistency} cube={cube} draftId={draft.draft_id}
            cards={cards} onFixed={reloadConsistency} />
        )}
        <ul className="ocr-card-list">
          {draft.players.map(p => {
            const pool = (p.photos.checkin || []).length + (p.photos.checkout || []).length;
            const deck = (p.photos.deck || []).length;
            return (
              <li key={p.id}>
                <button className="ocr-card-row" onClick={() => setPlayerId(p.id)}>
                  <span className="ocr-card-title">
                    <span className={`ocr-status-dot ${p.status || 'unstarted'}`} />
                    {p.id}
                  </span>
                  <span className="ocr-badges">
                    {p.needs_reconfirm && (
                      <span className="ocr-badge reconfirm" title="deck is stale - re-confirm to write the corrected pool">reconfirm</span>
                    )}
                    {p.warnings && p.warnings.length > 0 && (
                      <span className="ocr-badge warn" title={p.warnings.join("\n")}>
                        {p.warnings.length} warning{p.warnings.length === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="ocr-meta">{pool} pool · {deck} deck</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="ocr-import">
      <h2 className="ocr-title">Import a draft</h2>
      <ul className="ocr-card-list">
        {drafts.map(d => {
          const done = d.players > 0 && d.confirmed >= d.players;
          return (
            <li key={d.draft_id}>
              <button className="ocr-card-row" onClick={() => openDraft(d.draft_id)}>
                <span className="ocr-card-head">
                  <span className="ocr-card-title">{d.event_name || d.draft_id}</span>
                  {d.flight && <span className="ocr-meta">{d.flight}</span>}
                </span>
                <span className="ocr-badges">
                  {d.conflicts > 0 && (
                    <span className="ocr-badge conflict" title="pool does not match the cube">
                      {d.conflicts} conflict{d.conflicts === 1 ? "" : "s"}
                    </span>
                  )}
                  {d.reconfirm_needed > 0 && (
                    <span className="ocr-badge reconfirm" title="confirmed decks are stale and need re-confirming">
                      {d.reconfirm_needed} reconfirm
                    </span>
                  )}
                  {d.warnings > 0 && (
                    <span className="ocr-badge warn" title="confirmed decks have cross-check warnings">
                      {d.warnings} warning{d.warnings === 1 ? "" : "s"}
                    </span>
                  )}
                  <span className={`ocr-badge ${done ? "done" : ""}`}>{d.confirmed}/{d.players} done</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// applyCaptureFix reassigns or removes one pool box behind a discrepancy, then
// re-derives the player's pool so the consistency check reflects the change.
// The session merges per-player server-side, so we load the player's current
// work, mutate the one box, and post the whole player back. newName === null
// removes the box (a stray detection); otherwise it's a rename (status "high",
// same as picking a name by hand in the workspace). An over-count is usually a
// misread of a card that's "missing", so renaming the bad box to that missing
// card fixes both at once.
async function applyCaptureFix(cube, draftId, cap, newName) {
  const sess = await LoadOCRSession(cube, draftId);
  const pw = (sess.players && sess.players[cap.player]) || {};
  const boxes = pw.boxes || {};
  const photoBoxes = boxes[cap.photo] || [];
  const nextPhoto = newName === null
    ? photoBoxes.filter(b => b.id !== cap.box_id)
    : photoBoxes.map(b => b.id === cap.box_id ? { ...b, chosen: newName, status: "high" } : b);
  const newBoxes = { ...boxes, [cap.photo]: nextPhoto };
  await SaveOCRSession(cube, draftId, {
    draft_id: draftId,
    players: { [cap.player]: {
      ...pw,
      status: pw.status || "in_progress",
      boxes: newBoxes,
      pool_entries: deriveList(newBoxes, pw.overrides || {}),
      mainboard_entries: deriveList(pw.deck_boxes || {}, pw.deck_overrides || {}),
    } },
  });
}

// ConsistencyPanel summarizes the sum of every player's pool against the cube
// list. A clean draft pools each cube card its full copy count, so "over"
// (too many copies) and "unknown" (a name not in the cube) are real OCR errors
// shown loudly. "Missing" is expected until every player is scanned, so it's
// folded behind a toggle. Each error row expands to the pool boxes behind it,
// where the operator can rename or drop the misread box to fix the count.
function ConsistencyPanel({ report, cube, draftId, cards, onFixed }) {
  const [showMissing, setShowMissing] = useState(false);
  const discs = report.discrepancies || [];
  const errors = discs.filter(d => d.kind === "over" || d.kind === "unknown");
  const missing = discs.filter(d => d.kind === "missing");
  const missingNames = missing.map(d => d.card_name);
  const clean = errors.length === 0;
  return (
    <div className={`ocr-consistency ${clean ? "ok" : "warn"}`}>
      <div className="ocr-consistency-head">
        <span className="ocr-consistency-totals">
          {report.pool_total} / {report.cube_total} cube cards pooled
          <span className="ocr-consistency-players"> · {report.players_counted}/{report.players_total} players scanned</span>
        </span>
        {clean
          ? <span className="ocr-consistency-flag ok">no conflicts</span>
          : <span className="ocr-consistency-flag warn">{errors.length} to check</span>}
      </div>
      {errors.length > 0 && (
        <ul className="ocr-consistency-list">
          {errors.map(d => (
            <DiscrepancyRow key={d.kind + d.card_name} disc={d} cube={cube} draftId={draftId}
              cards={cards} missingNames={missingNames} onFixed={onFixed} />
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <div className="ocr-consistency-missing">
          <button onClick={() => setShowMissing(v => !v)}>
            {showMissing ? "Hide" : "Show"} {missing.length} not yet pooled
          </button>
          {showMissing && (
            <ul className="ocr-consistency-list">
              {missing.map(d => (
                <li key={d.card_name} className="ocr-disc missing">
                  <span className="ocr-disc-name">{d.card_name}</span>
                  <span className="ocr-disc-count">{d.pooled} / {d.cube}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// DiscrepancyRow is one over/unknown card. Clicking it expands to the pool boxes
// (captures) that resolved to its name, each with a fix control.
function DiscrepancyRow({ disc, cube, draftId, cards, missingNames, onFixed }) {
  const [open, setOpen] = useState(false);
  const captures = disc.captures || [];
  return (
    <li className={`ocr-disc ${disc.kind} ${open ? "open" : ""}`}>
      <button className="ocr-disc-row" onClick={() => setOpen(v => !v)} disabled={captures.length === 0}>
        <span className="ocr-disc-kind">{disc.kind === "over" ? "over" : "not in cube"}</span>
        <span className="ocr-disc-name">{disc.card_name}</span>
        <span className="ocr-disc-count">
          {disc.kind === "over" ? `${disc.pooled} pooled, cube has ${disc.cube}` : `${disc.pooled} pooled`}
        </span>
        {captures.length > 0 && <span className="ocr-disc-toggle">{open ? "−" : "+"}</span>}
      </button>
      {open && (
        <ul className="ocr-disc-captures">
          {captures.map(cap => (
            <CaptureFix key={cap.player + cap.photo + cap.box_id} cap={cap} cube={cube} draftId={draftId}
              cards={cards} missingNames={missingNames} onFixed={onFixed} />
          ))}
        </ul>
      )}
    </li>
  );
}

// CaptureFix shows one pool box's cropped nameplate next to its current name and
// lets the operator correct it: rename to a missing card (the likely fix for an
// over-count), to one of the box's own OCR candidates, to any card by search, or
// drop the box if it's a stray detection.
function CaptureFix({ cap, cube, draftId, cards, missingNames, onFixed }) {
  const [busy, setBusy] = useState(false);
  const source = { photo: cap.photo, box: cap.bbox };
  const cand = (cap.candidates || []).filter(c => c.name !== cap.chosen).slice(0, 3);

  const fix = async newName => {
    if (busy) return;
    setBusy(true);
    try {
      await applyCaptureFix(cube, draftId, cap, newName);
      await onFixed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`ocr-capture ${busy ? "busy" : ""}`}>
      <div className="ocr-capture-top">
        <Snippet cube={cube} source={source} w={264} h={56} />
        <span className="ocr-capture-meta">
          <span className="ocr-capture-player">{cap.player}</span>
          <span className="ocr-capture-name">{cap.chosen}</span>
        </span>
        <button className="ocr-capture-remove" onClick={() => fix(null)} disabled={busy} title="drop this detection">remove</button>
      </div>
      <div className="ocr-capture-fix">
        {missingNames.length > 0 && (
          <div className="ocr-capture-missing">
            <span className="ocr-capture-label">missing:</span>
            {missingNames.slice(0, 6).map(name => (
              <button key={name} onClick={() => fix(name)} disabled={busy}>{name}</button>
            ))}
          </div>
        )}
        {cand.length > 0 && (
          <div className="ocr-cand">
            {cand.map(c => (
              <button key={c.name} onClick={() => fix(c.name)} disabled={busy}>
                {c.name}{c.score != null ? ` (${c.score.toFixed(2)})` : ""}
              </button>
            ))}
          </div>
        )}
        <Autocomplete cards={cards} onPick={fix} placeholder="rename to…" />
      </div>
    </li>
  );
}
