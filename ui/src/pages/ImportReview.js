import React, { useEffect, useState } from 'react';
import { Autocomplete } from './PoolList.js';
import { LoadImportCards, CheckDecks, CommitDraft } from '../utils/ImportFetch.js';

// deckList returns the editable card list for a deck: its pool if pool-only,
// else the mainboard. Sideboard is preserved but not edited in v1.
function deckList(deck) {
  return (deck.pool && deck.pool.length) ? deck.pool : deck.mainboard || [];
}

// withList returns a copy of deck with its editable list replaced.
function withList(deck, list) {
  if (deck.pool && deck.pool.length) return { ...deck, pool: list };
  return { ...deck, mainboard: list };
}

// ImportReview shows the parsed decks with inline fixes and commits them.
export default function ImportReview({ cube, initialDecks, initialReport, draftId, date, eventName, onBack, onCommitted }) {
  const [decks, setDecks] = useState(initialDecks);
  const [report, setReport] = useState(initialReport);
  const [cards, setCards] = useState([]);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { LoadImportCards(cube).then(setCards).catch(() => setCards([])); }, [cube]);

  // recheck re-validates the current decks against the cube after an edit.
  async function recheck(next) {
    setDecks(next);
    try { setReport(await CheckDecks(cube, next)); } catch { /* keep prior report */ }
  }

  function editDeck(i, deck) {
    const next = decks.map((d, j) => j === i ? deck : d);
    recheck(next);
  }

  function setCount(i, name, count) {
    const list = deckList(decks[i]).map(c => c.name === name ? { ...c, count: Math.max(0, count) } : c).filter(c => c.count > 0);
    editDeck(i, withList(decks[i], list));
  }
  function rename(i, oldName, newName) {
    const list = deckList(decks[i]);
    const target = list.find(c => c.name === oldName);
    if (!target) return;
    const existing = list.find(c => c.name === newName && c !== target);
    const next = existing
      ? list.map(c => c === existing ? { ...c, count: c.count + target.count } : c).filter(c => c !== target)
      : list.map(c => c === target ? { ...c, name: newName } : c);
    editDeck(i, withList(decks[i], next));
  }
  function addCard(i, name) {
    const list = deckList(decks[i]);
    const existing = list.find(c => c.name === name);
    const next = existing ? list.map(c => c.name === name ? { ...c, count: c.count + 1 } : c) : [...list, { name, count: 1 }];
    editDeck(i, withList(decks[i], next));
  }
  function setPlayer(i, player) {
    editDeck(i, { ...decks[i], player });
  }

  async function commit() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await CommitDraft(cube, { draft_id: draftId, date, event_name: eventName, decks });
      setDone(res.draft_id);
      if (onCommitted) onCommitted(res.draft_id);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="import-review done">
        <p>Imported draft <code>{done}</code>.</p>
        <a href={`#/${cube}/decklists`}>View decklists</a>
      </div>
    );
  }

  const clean = report && report.clean;
  const unknownNames = (report ? report.discrepancies : []).filter(d => d.kind === 'unknown').map(d => d.card_name);

  return (
    <div className="import-review">
      <ConsistencyPanel report={report} />
      <div className="import-decks">
        {decks.map((deck, i) => (
          <div className="import-deck" key={i}>
            <div className="import-deck-head">
              <label>Player<input value={deck.player || ''} onChange={e => setPlayer(i, e.target.value)} placeholder="player" /></label>
              {deck.filename && <span className="ocr-meta">{deck.filename}</span>}
            </div>
            {deck.warnings && deck.warnings.length > 0 && (
              <ul className="import-warnings">
                {deck.warnings.map((w, k) => <li key={k}>{w}</li>)}
              </ul>
            )}
            <ul className="import-card-list">
              {deckList(deck).map(c => {
                const unknown = unknownNames.includes(c.name);
                return (
                  <li key={c.name} className={unknown ? 'unknown' : ''}>
                    <input type="number" min="0" value={c.count}
                      onChange={e => setCount(i, c.name, parseInt(e.target.value || '0', 10))} />
                    <span className="import-card-name">{c.name}</span>
                    {unknown && (
                      <span className="import-card-fix">
                        <Autocomplete cards={cards} placeholder="rename to…" onPick={name => rename(i, c.name, name)} />
                      </span>
                    )}
                    <button className="ocr-rm" onClick={() => setCount(i, c.name, 0)}>×</button>
                  </li>
                );
              })}
            </ul>
            <Autocomplete cards={cards} placeholder="add card…" onPick={name => addCard(i, name)} />
          </div>
        ))}
      </div>

      {error && <div className="import-error">{error}</div>}
      <div className="import-actions">
        <button onClick={onBack} disabled={busy}>Back</button>
        {!clean && (
          <label className="import-override">
            <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
            commit anyway ({(report ? report.discrepancies : []).filter(d => d.kind !== 'missing').length} conflicts)
          </label>
        )}
        <button className="import-commit" onClick={commit} disabled={busy || (!clean && !override)}>
          {busy ? 'Committing…' : 'Commit draft'}
        </button>
      </div>
    </div>
  );
}

// ConsistencyPanel mirrors the OCR one: "over"/"unknown" are loud errors,
// "missing" (not yet entered) is folded behind a toggle.
function ConsistencyPanel({ report }) {
  const [showMissing, setShowMissing] = useState(false);
  if (!report) return null;
  const discs = report.discrepancies || [];
  const errors = discs.filter(d => d.kind === 'over' || d.kind === 'unknown');
  const missing = discs.filter(d => d.kind === 'missing');
  const clean = errors.length === 0;
  return (
    <div className={`ocr-consistency ${clean ? 'ok' : 'warn'}`}>
      <div className="ocr-consistency-head">
        <span className="ocr-consistency-totals">{report.seen_total} / {report.cube_total} cube cards entered</span>
        {clean
          ? <span className="ocr-consistency-flag ok">no conflicts</span>
          : <span className="ocr-consistency-flag warn">{errors.length} to check</span>}
      </div>
      {errors.length > 0 && (
        <ul className="ocr-consistency-list">
          {errors.map(d => (
            <li key={d.kind + d.card_name} className={`ocr-disc ${d.kind}`}>
              <span className="ocr-disc-kind">{d.kind === 'over' ? 'over' : 'not in cube'}</span>
              <span className="ocr-disc-name">{d.card_name}</span>
              <span className="ocr-disc-count">
                {d.kind === 'over' ? `${d.seen} entered, cube has ${d.cube}` : `${d.seen} entered`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <div className="ocr-consistency-missing">
          <button onClick={() => setShowMissing(v => !v)}>{showMissing ? 'Hide' : 'Show'} {missing.length} not yet entered</button>
          {showMissing && (
            <ul className="ocr-consistency-list">
              {missing.map(d => (
                <li key={d.card_name} className="ocr-disc missing">
                  <span className="ocr-disc-name">{d.card_name}</span>
                  <span className="ocr-disc-count">{d.seen} / {d.cube}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
