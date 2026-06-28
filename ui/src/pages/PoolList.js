import React, { useState } from 'react';
import { ImageURL } from '../utils/OCRFetch.js';
import { STATUS_COLOR } from '../utils/OCRStatus.js';

const BASIC_NAMES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

// Snippet crops the card-name region out of the source photo into a uniform
// thumbnail. Detected line heights are unreliable (anything from 1px to the
// whole card), so we scale by the box WIDTH (the stable card-column width) and
// center vertically on the line, showing a fixed window that captures the name
// regardless of the detected height. The full image is browser-cached, so rows
// sharing a photo reuse one download.
const SNIP_W = 132, SNIP_H = 30;

export function Snippet({ cube, source, bust, w = SNIP_W, h = SNIP_H }) {
  const [dim, setDim] = useState(null);
  const photo = source && source.photo;
  const box = source && source.box;
  if (!photo || !box || !box.Width) return <span className="ocr-snip ocr-snip-empty" style={{ width: `${w}px`, height: `${h}px` }} />;
  const scale = w / box.Width;
  const cy = box.Y + box.Height / 2;
  return (
    <span className="ocr-snip" style={{ width: `${w}px`, height: `${h}px` }}>
      <img
        src={ImageURL(cube, photo, bust ? bust(photo) : 0)} alt=""
        onLoad={e => setDim({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        style={dim ? {
          position: "absolute", maxWidth: "none",
          width: `${dim.w * scale}px`, height: `${dim.h * scale}px`,
          left: `${-box.X * scale}px`, top: `${-cy * scale + h / 2}px`,
        } : { opacity: 0 }}
      />
    </span>
  );
}

// Bigger snippet for unmatched rows: these need a human to read the card name
// off the photo and type it, so the crop is shown larger than the matched rows.
const UNMATCHED_SNIP_W = 264, UNMATCHED_SNIP_H = 64;

function Confidence({ status, score }) {
  if (score == null && !status) {
    return <span className="ocr-conf ocr-conf-manual" title="added by hand">&mdash;</span>;
  }
  return (
    <span className="ocr-conf" title={status || ""}>
      <span className="ocr-conf-dot" style={{ background: STATUS_COLOR[status] || "#94a3b8" }} />
      {score != null ? score.toFixed(2) : ""}
    </span>
  );
}

const SORTS = [["confidence", "Conf"], ["name", "Name"], ["image", "Image"]];

function sortEntries(entries, key) {
  const es = [...entries];
  if (key === "name") {
    es.sort((a, b) => a.card_name.localeCompare(b.card_name));
  } else if (key === "image") {
    es.sort((a, b) => {
      const pa = (a.source && a.source.photo) || "", pb = (b.source && b.source.photo) || "";
      if (pa !== pb) return pa.localeCompare(pb);
      const ba = (a.source && a.source.box) || {}, bb = (b.source && b.source.box) || {};
      return (ba.Y || 0) - (bb.Y || 0) || (ba.X || 0) - (bb.X || 0);
    });
  } else {
    // Confidence ascending: least-confident first, so cards needing review
    // float to the top. Hand-added cards (no score) sort to the bottom.
    es.sort((a, b) => (a.score == null ? 1 : a.score) - (b.score == null ? 1 : b.score));
  }
  return es;
}

// When tabNav is set the input joins a Tab-navigation group: Tab / Shift-Tab
// jump straight to the next / previous such input (skipping the candidate and
// remove buttons in between), so the operator can run down a column of
// unmatched rows from the keyboard.
export function Autocomplete({ cards, onPick, placeholder, tabNav, autoFocus }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const matches = q.length < 2 ? [] :
    cards.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  // sel can lag behind the match list as the query changes; clamp before use.
  const active = Math.min(sel, matches.length - 1);
  const pick = (name, el) => {
    onPick(name);
    setQ(""); setSel(0);
    // After a keyboard pick the resolved row unmounts and the inputs below it
    // shift up, so the next unmatched row lands at this input's old index.
    // Focus it on the next frame (once the list has re-rendered) so the
    // operator can run down the column on Enter alone, no Tab needed.
    if (tabNav && el) {
      const inputs = Array.from(document.querySelectorAll("input.ocr-tabnav"));
      const i = inputs.indexOf(el);
      requestAnimationFrame(() => {
        const after = Array.from(document.querySelectorAll("input.ocr-tabnav"));
        const next = after[i] || after[after.length - 1];
        if (next) next.focus();
      });
    }
  };
  function onKeyDown(e) {
    if (matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, matches.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); pick(matches[active].name, e.target); return; }
    }
    if (!tabNav || e.key !== "Tab") return;
    const inputs = Array.from(document.querySelectorAll("input.ocr-tabnav"));
    const i = inputs.indexOf(e.target);
    if (i === -1) return;
    const next = inputs[i + (e.shiftKey ? -1 : 1)];
    if (next) { e.preventDefault(); next.focus(); }
  }
  return (
    <div className="ocr-add">
      <input value={q} placeholder={placeholder || "add card…"} className={tabNav ? "ocr-tabnav" : undefined}
        autoFocus={autoFocus}
        onChange={e => { setQ(e.target.value); setSel(0); }} onKeyDown={onKeyDown} />
      {matches.length > 0 && (
        <ul className="ocr-ac">
          {matches.map((c, i) => (
            <li key={c.name}>
              <button className={i === active ? "active" : ""} onClick={() => pick(c.name)}>{c.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// UnmatchedRow is a detection box OCR couldn't name (red square). We show the
// snippet, any low-confidence guesses as quick-picks, and a free-text search so
// the operator can fill the name in by hand. Picking resolves the box, which
// drops the row and adds the card to the list above.
function UnmatchedRow({ cube, row, cards, onFillName, onRemoveBox, bust }) {
  const fill = name => onFillName(row.photo, row.boxId, name);
  return (
    <li className="ocr-unmatched">
      <Snippet cube={cube} source={row.source} bust={bust} w={UNMATCHED_SNIP_W} h={UNMATCHED_SNIP_H} />
      <span className="ocr-conf-dot" style={{ background: STATUS_COLOR.unmatched }} title="unmatched" />
      <div className="ocr-unmatched-pick">
        <Autocomplete cards={cards} onPick={fill} placeholder="name this card…" tabNav />
        {(row.candidates || []).length > 0 && (
          <div className="ocr-cand">
            {row.candidates.slice(0, 3).map(c => (
              <button key={c.name} onClick={() => fill(c.name)}>{c.name} ({c.score.toFixed(2)})</button>
            ))}
          </div>
        )}
      </div>
      <button className="ocr-rm" onClick={() => onRemoveBox(row.photo, row.boxId)}>×</button>
    </li>
  );
}

export function PoolList({
  title, entries, cards, target, cube,
  onSetCount, onRemove, onChangeName, onAdd,
  unmatched, onFillName, onRemoveBox,
  basics, onSetBasic,
  hoveredName, setHoveredName,
  breakdown, onMove, moveLabel, bust,
}) {
  const [sortKey, setSortKey] = useState("confidence");
  const draftedCards = entries.reduce((s, e) => s + e.count, 0);
  const basicLands = basics ? Object.values(basics).reduce((s, n) => s + n, 0) : 0;
  const capByName = React.useMemo(() => {
    const m = {}; cards.forEach(c => { m[c.name] = c.max_copies || 1; }); return m;
  }, [cards]);
  const sorted = React.useMemo(() => sortEntries(entries, sortKey), [entries, sortKey]);
  return (
    <div className="ocr-pool">
      <div className="ocr-pool-head">
        <h3>{title}</h3>
        {breakdown ? (
          <span className="ocr-breakdown">
            {breakdown.cards} cards · {breakdown.lands} lands · {breakdown.basics} basics
          </span>
        ) : (
          <span className={draftedCards === target ? "ok" : "warn"}>{draftedCards}{target ? ` / ${target}` : ""}</span>
        )}
      </div>
      <div className="ocr-sort">
        {SORTS.map(([k, label]) => (
          <button key={k} className={sortKey === k ? "active" : ""} onClick={() => setSortKey(k)}>{label}</button>
        ))}
      </div>
      <ul className="ocr-pool-list">
        {(unmatched || []).map(row => (
          <UnmatchedRow key={row.boxId} cube={cube} row={row} cards={cards}
            onFillName={onFillName} onRemoveBox={onRemoveBox} bust={bust} />
        ))}
        {sorted.map((e, i) => {
          const over = e.count > (capByName[e.card_name] || 1);
          const hot = e.card_name === hoveredName;
          return (
            <li key={e.card_name} className={`${over ? "over" : ""} ${hot ? "hot" : ""}`}
              onMouseEnter={() => setHoveredName && setHoveredName(e.card_name)}
              onMouseLeave={() => setHoveredName && setHoveredName(null)}>
              <span className="ocr-rownum">{i + 1}</span>
              <Snippet cube={cube} source={e.source} bust={bust} />
              <select value={e.card_name} onChange={ev => onChangeName(e.card_name, ev.target.value)}>
                <option value={e.card_name}>{e.card_name}</option>
                {(e.candidates || []).filter(c => c.name !== e.card_name).map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.score.toFixed(2)})</option>
                ))}
              </select>
              <Confidence status={e.status} score={e.score} />
              <span className="ocr-count">
                <button onClick={() => onSetCount(e.card_name, Math.max(0, e.count - 1))}>-</button>
                {e.count}
                <button onClick={() => onSetCount(e.card_name, e.count + 1)}>+</button>
              </span>
              {onMove && <button className="ocr-move" onClick={() => onMove(e.card_name)}>{moveLabel}</button>}
              <button className="ocr-rm" onClick={() => onRemove(e.card_name)}>×</button>
            </li>
          );
        })}
      </ul>
      <Autocomplete cards={cards} onPick={onAdd} />
      {basics && (
        <div className="ocr-basics">
          <h4>Basics ({basicLands})</h4>
          {BASIC_NAMES.map(b => (
            <label key={b}>
              {b}
              <button onClick={() => onSetBasic(b, Math.max(0, (basics[b] || 0) - 1))}>-</button>
              <span>{basics[b] || 0}</span>
              <button onClick={() => onSetBasic(b, (basics[b] || 0) + 1)}>+</button>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
