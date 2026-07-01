import React from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
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
// control to return here. The chosen mode lives in the URL (/import/:mode) so a
// refresh stays on the flow instead of dropping back to the picker.
export default function ImportHub() {
  const { cube, mode: modeKey } = useParams();
  const navigate = useNavigate();
  const mode = MODES.find(m => m.key === modeKey);

  // Unknown mode in the URL - send them back to the picker.
  if (modeKey && !mode) {
    return <Navigate to={`/${cube}/import`} replace />;
  }

  if (mode) {
    const back = () => navigate(`/${cube}/import`);
    // The photo-scan workspace manages its own full-bleed width, so don't cap it.
    return (
      <div className={mode.kind === 'ocr' ? 'import-hub wide' : 'import-hub'}>
        <button className="ocr-back" onClick={back}>&larr; Import modes</button>
        {mode.kind === 'text' && <ImportWizard source={mode.key} onDone={back} />}
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
            <button className="import-mode" onClick={() => navigate(`/${cube}/import/${m.key}`)}>
              <span className="import-mode-title">{m.title}</span>
              <span className="import-mode-blurb">{m.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
