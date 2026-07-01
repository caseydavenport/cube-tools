import React, { useState } from 'react';
import OCRImport from './OCRImport.js';
import ImportWizard from './ImportWizard.js';
import HedronImport from './HedronImport.js';

// MODES drives the picker grid and the dispatch below. `kind` selects the flow;
// text kinds are handled by ImportWizard, image kinds by their own components.
const MODES = [
  { key: 'paste',  kind: 'text',   title: 'Paste a decklist',   blurb: 'Paste .txt or Delver Lens .csv text.' },
  { key: 'upload', kind: 'text',   title: 'Upload deck files',  blurb: 'One or more .txt / .csv files.' },
  { key: 'dir',    kind: 'text',   title: 'Server directory',   blurb: 'Parse a folder of deck files on the server.' },
  { key: 'hedron', kind: 'hedron', title: 'Hedron Network',     blurb: 'Fetch draft photos from CubeCobra/Hedron, then OCR.' },
  { key: 'ocr',    kind: 'ocr',    title: 'Photo scan',         blurb: 'Reconcile scanned deck photos already on disk.' },
];

// ImportHub is the /import landing: pick a mode, then run its flow with a back
// control to return here.
export default function ImportHub() {
  const [mode, setMode] = useState(null);

  if (mode) {
    return (
      <div className="import-hub">
        <button className="ocr-back" onClick={() => setMode(null)}>&larr; Import modes</button>
        {mode.kind === 'text' && <ImportWizard source={mode.key} onDone={() => setMode(null)} />}
        {mode.kind === 'hedron' && <HedronImport />}
        {mode.kind === 'ocr' && <OCRImport />}
      </div>
    );
  }

  return (
    <div className="import-hub">
      <h2 className="ocr-title">Import a draft</h2>
      <ul className="import-modes">
        {MODES.map(m => (
          <li key={m.key}>
            <button className="import-mode" onClick={() => setMode(m)}>
              <span className="import-mode-title">{m.title}</span>
              <span className="import-mode-blurb">{m.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
