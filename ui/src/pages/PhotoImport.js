import React, { useEffect, useRef, useState } from 'react';
import { useCube } from '../contexts/CubeContext.js';
import { CreatePhotoDraft } from '../utils/ImportFetch.js';
import OCRImport from './OCRImport.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// PhotoImport uploads a folder of deck photos (one per player) to build a draft,
// then drops into the OCR reconcile screen for the new draft. Player order is
// by sorted filename, matching what the server does with the staged files.
export default function PhotoImport() {
  const cube = useCube();
  const [files, setFiles] = useState([]);
  const [date, setDate] = useState(today());
  const [slug, setSlug] = useState('');
  const [eventName, setEventName] = useState('');
  const [flight, setFlight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState(null);
  const pickerRef = useRef(null);

  // webkitdirectory turns the file input into a folder picker. It's not a
  // standard React prop, so set it on the DOM node directly.
  useEffect(() => {
    if (pickerRef.current) {
      pickerRef.current.setAttribute('webkitdirectory', '');
      pickerRef.current.setAttribute('directory', '');
    }
  }, []);

  if (draftId) {
    return <OCRImport initialDraftId={draftId} />;
  }

  function onPick(e) {
    const picked = Array.from(e.target.files || [])
      .filter(f => /\.(jpe?g|png)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    setFiles(picked);
    setError('');
  }

  async function create() {
    if (!files.length || !date || !slug || busy) return;
    setBusy(true); setError('');
    try {
      setDraftId(await CreatePhotoDraft(cube, {
        date, slug, event_name: eventName, flight,
      }, files));
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
        <label>Photos folder
          <input ref={pickerRef} type="file" multiple accept="image/*" onChange={onPick} />
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
          <button onClick={create} disabled={!files.length || !date || !slug || busy}>
            {busy ? 'Working…' : 'Create draft'}
          </button>
        </div>
      </div>
      {error && <div className="import-error">{error}</div>}
      {files.length > 0 && (
        <div className="import-photos-scan">
          {files.length} image{files.length === 1 ? '' : 's'} ({files.length} player{files.length === 1 ? '' : 's'}):
          <ul>{files.map((f, i) => <li key={f.name + i}>p{i + 1} — {f.name}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
