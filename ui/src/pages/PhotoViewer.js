import React, { useRef, useState, useEffect } from 'react';
import { ImageURL } from '../utils/OCRFetch.js';
import { STATUS_COLOR } from '../utils/OCRStatus.js';

const CORNERS = ["nw", "ne", "sw", "se"];

// Start zoomed in past Fit so card names are legible without reaching for the
// zoom control on every photo. Fit (1x) is still one click away.
const DEFAULT_ZOOM = 1.5;

function roundBox(b) {
  return { X: Math.round(b.X), Y: Math.round(b.Y), Width: Math.round(b.Width), Height: Math.round(b.Height) };
}

export function PhotoViewer({
  cube, photo, photos, onSelectPhoto,
  boxes, onDrawBox, onResizeBox, onDeleteBox,
  hoveredName, setHoveredName,
  onRedetect, onRotate, onClear, detecting, bust,
}) {
  const ver = p => (bust ? bust(p) : 0);
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [region, setRegion] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState(null);       // new-box rubber band {x0,y0,x1,y1}
  const [selectedId, setSelectedId] = useState(null);
  const [active, setActive] = useState(null);   // {type,id,corner,startBox,startPt,current}
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useEffect(() => { setSelectedId(null); setZoom(DEFAULT_ZOOM); }, [photo]);

  // Track the stage's inner size so we can fit the photo into it without
  // distortion, at a consistent size regardless of the image's dimensions.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setRegion({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function toImg(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = dim.w / rect.width, sy = dim.h / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  useEffect(() => {
    if (!drag && !active) return;
    function onMove(e) {
      const p = toImg(e);
      if (drag) { setDrag(d => ({ ...d, x1: p.x, y1: p.y })); return; }
      const dx = p.x - active.startPt.x, dy = p.y - active.startPt.y;
      const b = active.startBox;
      let nb;
      if (active.type === "move") {
        nb = { X: b.X + dx, Y: b.Y + dy, Width: b.Width, Height: b.Height };
      } else {
        let x0 = b.X, y0 = b.Y, x1 = b.X + b.Width, y1 = b.Y + b.Height;
        if (active.corner.includes("w")) x0 += dx;
        if (active.corner.includes("e")) x1 += dx;
        if (active.corner.includes("n")) y0 += dy;
        if (active.corner.includes("s")) y1 += dy;
        nb = { X: Math.min(x0, x1), Y: Math.min(y0, y1), Width: Math.abs(x1 - x0), Height: Math.abs(y1 - y0) };
      }
      setActive(a => ({ ...a, current: roundBox(nb) }));
    }
    function onUp() {
      if (drag) {
        const box = {
          X: Math.round(Math.min(drag.x0, drag.x1)), Y: Math.round(Math.min(drag.y0, drag.y1)),
          Width: Math.round(Math.abs(drag.x1 - drag.x0)), Height: Math.round(Math.abs(drag.y1 - drag.y0)),
        };
        setDrag(null);
        if (box.Width > 8 && box.Height > 6) onDrawBox(box);
      } else if (active) {
        const a = active;
        setActive(null);
        if (a.current && (a.current.X !== a.startBox.X || a.current.Y !== a.startBox.Y ||
          a.current.Width !== a.startBox.Width || a.current.Height !== a.startBox.Height)) {
          onResizeBox(a.id, a.current);
        }
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, active]);

  const sw = Math.max(2, dim.w / 400);
  const hs = Math.max(7, dim.w / 110);
  const fs = Math.max(11, dim.w / 55);

  // A new box's default size, learned from the boxes already on this photo
  // (nameplates are all about the same size). Falls back to a wide, short
  // strip relative to the image when there's nothing to learn from yet.
  function defaultBoxSize() {
    const bs = (boxes || []).map(b => b.bbox).filter(b => b && b.Width && b.Height);
    if (bs.length) {
      const med = vals => { const s = [...vals].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
      return { w: med(bs.map(b => b.Width)), h: med(bs.map(b => b.Height)) };
    }
    return { w: Math.round(dim.w * 0.22), h: Math.round(dim.h * 0.04) };
  }

  function startDrawOrDeselect(e) {
    if (!dim.w) return;
    setSelectedId(null);
    const p = toImg(e);
    // Ctrl/Cmd-click drops a default-sized box with its left edge at the
    // click, instead of drawing it by hand. Quick way to tag nameplates when
    // they're all about the same size.
    if (e.ctrlKey || e.metaKey) {
      const { w, h } = defaultBoxSize();
      onDrawBox({ X: Math.round(p.x), Y: Math.round(p.y - h / 2), Width: w, Height: h });
      return;
    }
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function boxDisplayBbox(b) {
    if (active && active.id === b.id && active.current) return active.current;
    return b.bbox;
  }

  const ZOOM_MIN = 1, ZOOM_MAX = 5, ZOOM_STEP = 0.5;
  const zoomTo = z => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2))));

  // At Fit (zoom 1) the photo fills as much of the stage as it can without
  // distortion; higher zoom scales up from there and the stage scrolls.
  const fit = (dim.w && region.w && region.h) ? Math.min(region.w / dim.w, region.h / dim.h) : 0;
  const canvasW = fit > 0 ? Math.floor(dim.w * fit * zoom) : 0;

  return (
    <div className="ocr-viewer">
      <div className="ocr-zoom">
        <button onClick={() => zoomTo(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Zoom out">&minus;</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomTo(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="Zoom in">+</button>
        <button className="ocr-zoom-fit" onClick={() => zoomTo(1)} disabled={zoom === 1}>Fit</button>
        {onRotate && (
          <>
            <button className="ocr-rotate" onClick={() => onRotate("ccw")} disabled={detecting} title="Rotate left">↺</button>
            <button className="ocr-rotate" onClick={() => onRotate("cw")} disabled={detecting} title="Rotate right">↻</button>
          </>
        )}
        {onRedetect && (
          <button className="ocr-redetect" onClick={onRedetect} disabled={detecting}>
            {detecting ? "Scanning…" : "Scan photo"}
          </button>
        )}
        {onClear && (
          <button className="ocr-clear" onClick={onClear} disabled={detecting || !(boxes || []).length}>
            Clear
          </button>
        )}
      </div>
      <div className="ocr-canvas-scroll" ref={stageRef}>
        <div className="ocr-canvas" style={canvasW ? { width: `${canvasW}px` } : undefined}>
        <img
          src={ImageURL(cube, photo, ver(photo))}
          alt={photo}
          onLoad={e => setDim({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        />
        {dim.w > 0 && (
          <svg
            ref={svgRef}
            className="ocr-overlay"
            viewBox={`0 0 ${dim.w} ${dim.h}`}
            preserveAspectRatio="none"
            onMouseDown={startDrawOrDeselect}
          >
            {(boxes || []).map(b => {
              const bb = boxDisplayBbox(b);
              const color = STATUS_COLOR[b.status] || "#ef4444";
              const highlit = b.chosen && b.chosen === hoveredName;
              const selected = b.id === selectedId;
              return (
                <g key={b.id}>
                  <rect
                    x={bb.X} y={bb.Y} width={bb.Width} height={bb.Height}
                    fill={highlit ? "rgba(56,189,248,0.18)" : "transparent"}
                    stroke={selected ? "#38bdf8" : color}
                    strokeWidth={highlit || selected ? sw * 1.8 : sw}
                    strokeDasharray={b.status === "pending" ? `${sw * 3} ${sw * 2}` : undefined}
                    style={{ cursor: "move" }}
                    onMouseEnter={() => b.chosen && setHoveredName(b.chosen)}
                    onMouseLeave={() => setHoveredName(null)}
                    onMouseDown={e => {
                      e.stopPropagation();
                      setSelectedId(b.id);
                      setActive({ type: "move", id: b.id, startBox: bb, startPt: toImg(e) });
                    }}
                  />
                  {(highlit || selected) && b.chosen && (
                    <text x={bb.X} y={Math.max(fs, bb.Y - sw * 2)} fontSize={fs} fill="#e2e8f0"
                      stroke="#0f172a" strokeWidth={fs / 8} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                      {b.chosen}
                    </text>
                  )}
                  {selected && (
                    <>
                      {CORNERS.map(c => {
                        const cx = bb.X + (c.includes("e") ? bb.Width : 0);
                        const cy = bb.Y + (c.includes("s") ? bb.Height : 0);
                        return (
                          <rect key={c} x={cx - hs / 2} y={cy - hs / 2} width={hs} height={hs}
                            fill="#38bdf8" stroke="#0f172a" strokeWidth={sw / 2}
                            style={{ cursor: "nwse-resize" }}
                            onMouseDown={e => {
                              e.stopPropagation();
                              setActive({ type: "resize", id: b.id, corner: c, startBox: bb, startPt: toImg(e) });
                            }}
                          />
                        );
                      })}
                      <g style={{ cursor: "pointer" }}
                        onMouseDown={e => { e.stopPropagation(); onDeleteBox(b.id); setSelectedId(null); }}>
                        <circle cx={bb.X + bb.Width} cy={bb.Y} r={hs} fill="#ef4444" stroke="#0f172a" strokeWidth={sw / 2} />
                        <text x={bb.X + bb.Width} y={bb.Y + hs * 0.4} fontSize={hs * 1.4} fill="#fff"
                          textAnchor="middle" style={{ pointerEvents: "none" }}>×</text>
                      </g>
                    </>
                  )}
                </g>
              );
            })}
            {drag && (
              <rect
                x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)}
                width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)}
                fill="rgba(56,189,248,0.2)" stroke="#38bdf8" strokeWidth={sw} strokeDasharray={`${sw * 3} ${sw * 2}`}
              />
            )}
          </svg>
        )}
        </div>
      </div>
      <div className="ocr-thumbs">
        {photos.map(p => (
          <button key={p} className={p === photo ? "active" : ""} onClick={() => onSelectPhoto(p)}>
            <img src={ImageURL(cube, p, ver(p))} alt={p} />
          </button>
        ))}
      </div>
    </div>
  );
}
