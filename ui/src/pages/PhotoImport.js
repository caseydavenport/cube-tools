import React, { useState } from 'react';
import { useCube } from '../contexts/CubeContext.js';
import { ScanPhotoFolder, CreatePhotoDraft } from '../utils/ImportFetch.js';
import OCRImport from './OCRImport.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// PhotoImport builds a draft from a server-side folder of deck photos (one per
// player), then drops into the OCR reconcile screen for the new draft.
export default function PhotoImport() {
  const cube = useCube();
  const [sourcePath, setSourcePath] = useState('');
  const [date, setDate] = useState(today());
  const [slug, setSlug] = useState('');
  const [eventName, setEventName] = useState('');
  const [flight, setFlight] = useState('');
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState(null);

  if (draftId) {
    return <OCRImport initialDraftId={draftId} />;
  }

  async function doScan() {
    if (!sourcePath || busy) return;
    setBusy(true); setError(''); setScan(null);
    try {
      setScan(await ScanPhotoFolder(cube, sourcePath));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!sourcePath || !date || !slug || busy) return;
    setBusy(true); setError('');
    try {
      setDraftId(await CreatePhotoDraft(cube, {
        source_path: sourcePath, date, slug, event_name: eventName, flight,
      }));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-photos">
      <h2 className="ocr-title">Photo folder</h2>
      <div className="import-photos-form">
        <label>Source folder
          <input value={sourcePath} placeholder="/path/to/photos"
            onChange={e => setSourcePath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doScan(); }} />
        </label>
        <label>Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label>Slug
          <input value={slug} placeholder="myevent"
            onChange={e => setSlug(e.target.value)} />
        </label>
        <label>Event name
          <input value={eventName} onChange={e => setEventName(e.target.value)} />
        </label>
        <label>Flight (optional)
          <input value={flight} onChange={e => setFlight(e.target.value)} />
        </label>
        <div className="import-photos-actions">
          <button onClick={doScan} disabled={!sourcePath || busy}>{busy ? 'Working…' : 'Scan'}</button>
          <button onClick={create} disabled={!sourcePath || !date || !slug || busy}>Create draft</button>
        </div>
      </div>
      {error && <div className="import-error">{error}</div>}
      {scan && (
        <div className="import-photos-scan">
          Found {scan.count} image{scan.count === 1 ? '' : 's'} ({scan.count} player{scan.count === 1 ? '' : 's'}).
          {scan.images && scan.images.length > 0 && (
            <ul>{scan.images.map(n => <li key={n}>{n}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
