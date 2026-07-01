import React, { useState } from 'react';
import { useCube } from '../contexts/CubeContext.js';
import { ParseDecklists, ParseDir } from '../utils/ImportFetch.js';
import ImportReview from './ImportReview.js';

// today returns an ISO yyyy-mm-dd string for the default draft date.
function today() {
  return new Date().toISOString().slice(0, 10);
}

// slugId builds a filesystem-safe draft id from the date and event name.
// validID on the server rejects "/", "\\", and "..", so keep to [a-z0-9_-].
function slugId(date, eventName) {
  const slug = (eventName || 'import').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${date}_${slug || 'import'}`;
}

// playerFromFilename mirrors the server: strip the extension and any "_suffix".
function playerFromFilename(name) {
  return name.split('.')[0].split('_')[0].toLowerCase();
}

export default function ImportWizard({ source, onDone }) {
  const cube = useCube();
  const [step, setStep] = useState('source');

  // Source inputs (only the field for the active mode is used).
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);        // [{player, filename, content}]
  const [dir, setDir] = useState('');
  const [prefix, setPrefix] = useState('');
  const [filetype, setFiletype] = useState('.txt');

  // Configure inputs.
  const [date, setDate] = useState(today());
  const [eventName, setEventName] = useState('');
  const [draftId, setDraftId] = useState('');

  const [parsed, setParsed] = useState(null);     // {decks, report}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFiles(fileList) {
    const arr = await Promise.all(Array.from(fileList).map(f =>
      f.text().then(content => ({ player: playerFromFilename(f.name), filename: f.name, content }))));
    setFiles(arr);
  }

  const sourceReady =
    source === 'paste' ? text.trim().length > 0 :
    source === 'upload' ? files.length > 0 :
    dir.trim().length > 0;

  function toConfigure() {
    if (!sourceReady) return;
    if (!draftId) setDraftId(slugId(date, eventName));
    setStep('configure');
  }

  // toReview parses the source and moves to the review grid.
  async function toReview() {
    setBusy(true); setError('');
    try {
      let res;
      if (source === 'dir') {
        res = await ParseDir(cube, { dir, filetype, prefix });
      } else {
        const sources = source === 'paste'
          ? [{ player: '', filename: '', content: text, format: '' }]
          : files.map(f => ({ player: f.player, filename: f.filename, content: f.content, format: '' }));
        res = await ParseDecklists(cube, sources);
      }
      setParsed(res);
      setStep('review');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'review' && parsed) {
    return (
      <ImportReview
        cube={cube}
        initialDecks={parsed.decks}
        initialReport={parsed.report}
        draftId={draftId}
        date={date}
        eventName={eventName}
        onBack={() => setStep('configure')}
        onCommitted={onDone}
      />
    );
  }

  return (
    <div className="import-wizard">
      <WizardSteps step={step} />
      {error && <div className="import-error">{error}</div>}

      {step === 'source' && (
        <div className="import-source">
          {source === 'paste' && (
            <textarea className="import-paste" rows={16} value={text}
              placeholder={"1 Monastery Mentor\n1 Snapcaster Mage\n…"}
              onChange={e => setText(e.target.value)} />
          )}
          {source === 'upload' && (
            <div className="import-upload">
              <input type="file" multiple accept=".txt,.csv"
                onChange={e => onFiles(e.target.files)} />
              {files.length > 0 && (
                <ul className="import-file-list">
                  {files.map(f => <li key={f.filename}>{f.filename} <span className="ocr-meta">→ {f.player}</span></li>)}
                </ul>
              )}
            </div>
          )}
          {source === 'dir' && (
            <div className="import-dir">
              <label>Directory<input value={dir} onChange={e => setDir(e.target.value)} placeholder="/path/to/decks" /></label>
              <label>File type
                <select value={filetype} onChange={e => setFiletype(e.target.value)}>
                  <option value=".txt">.txt</option>
                  <option value=".csv">.csv</option>
                </select>
              </label>
              <label>Prefix (optional)<input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. bcp26_" /></label>
            </div>
          )}
          <div className="import-actions">
            <button onClick={toConfigure} disabled={!sourceReady}>Next</button>
          </div>
        </div>
      )}

      {step === 'configure' && (
        <div className="import-configure">
          <label>Draft id<input value={draftId} onChange={e => setDraftId(e.target.value)} /></label>
          <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Event name<input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="optional" /></label>
          <div className="import-actions">
            <button onClick={() => setStep('source')}>Back</button>
            <button onClick={toReview} disabled={busy || !draftId || !date}>{busy ? 'Parsing…' : 'Review'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// WizardSteps renders the Source → Configure → Review → Commit breadcrumb.
function WizardSteps({ step }) {
  const steps = ['source', 'configure', 'review'];
  const labels = { source: 'Source', configure: 'Configure', review: 'Review' };
  return (
    <ol className="import-steps">
      {steps.map(s => (
        <li key={s} className={s === step ? 'active' : ''}>{labels[s]}</li>
      ))}
      <li>Commit</li>
    </ol>
  );
}
