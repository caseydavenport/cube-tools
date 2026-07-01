import React, { useState } from 'react';
import { useCube } from '../contexts/CubeContext.js';
import { ListHedronDrafts, ImportHedronDraft } from '../utils/ImportFetch.js';
import OCRImport from './OCRImport.js';

// HedronImport lists the Hedron drafts for a CubeCobra cube id, imports the
// chosen one into this cube, and drops into its OCR reconcile screen.
export default function HedronImport() {
  const cube = useCube();
  const [cubeId, setCubeId] = useState('');
  const [drafts, setDrafts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [localDraftId, setLocalDraftId] = useState(null);

  if (localDraftId) {
    return <OCRImport initialDraftId={localDraftId} />;
  }

  async function list() {
    if (!cubeId || busy) return;
    setBusy(true); setError('');
    try {
      setDrafts(await ListHedronDrafts(cube, cubeId));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function importOne(hedronDraftId) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      setLocalDraftId(await ImportHedronDraft(cube, cubeId, hedronDraftId));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-hedron">
      <h2 className="ocr-title">Hedron Network</h2>
      <div className="import-hedron-lookup">
        <input value={cubeId} placeholder="CubeCobra cube id"
          onChange={e => setCubeId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') list(); }} />
        <button onClick={list} disabled={!cubeId || busy}>{busy ? 'Working…' : 'List drafts'}</button>
      </div>
      {error && <div className="import-error">{error}</div>}
      {drafts && drafts.length === 0 && <div className="import-empty">No drafts found for that cube.</div>}
      {drafts && drafts.length > 0 && (
        <ul className="ocr-card-list">
          {drafts.map(d => (
            <li key={d.draftId}>
              <button className="ocr-card-row" onClick={() => importOne(d.draftId)} disabled={busy}>
                <span className="ocr-card-head">
                  <span className="ocr-card-title">{d.eventName || d.draftId}</span>
                  {d.flightName && <span className="ocr-meta">{d.flightName}</span>}
                </span>
                <span className="ocr-badges">
                  <span className="ocr-meta">{(d.date || '').slice(0, 10)}</span>
                  <span className="ocr-meta">{(d.players || []).length} players</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
