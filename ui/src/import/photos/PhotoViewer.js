import React, { useEffect, useRef, useState } from "react"
import { ActionIcon, Button, Group, Text, Tooltip, UnstyledButton } from "@mantine/core"
import { IconMinus, IconPlus, IconRotate2, IconRotateClockwise2 } from "@tabler/icons-react"
import { photoURL } from "../importApi.js"
import { statusClass } from "./Snippet.js"

const CORNERS = ["nw", "ne", "sw", "se"]

// Zoom starts past Fit so card names are legible without zooming every photo.
// Fit (1x) is one click away.
const DEFAULT_ZOOM = 1.5
const ZOOM_MIN = 1
const ZOOM_MAX = 5
const ZOOM_STEP = 0.5

// roundBox rounds a box's position and size to whole pixels.
function roundBox(box) {
  return { X: Math.round(box.X), Y: Math.round(box.Y), Width: Math.round(box.Width), Height: Math.round(box.Height) }
}

// boxFromDrag turns a drag's two corners into a box.
function boxFromDrag(drag) {
  return roundBox({
    X: Math.min(drag.x0, drag.x1),
    Y: Math.min(drag.y0, drag.y1),
    Width: Math.abs(drag.x1 - drag.x0),
    Height: Math.abs(drag.y1 - drag.y0),
  })
}

// sameBox says whether two boxes have the same position and size.
function sameBox(a, b) {
  return a.X === b.X && a.Y === b.Y && a.Width === b.Width && a.Height === b.Height
}

// resizedBox moves or resizes a box by a pointer offset. For a resize, corner
// says which corner is being dragged.
function resizedBox(edit, dx, dy) {
  const start = edit.startBox
  if (edit.type === "move") {
    return roundBox({ X: start.X + dx, Y: start.Y + dy, Width: start.Width, Height: start.Height })
  }

  let x0 = start.X
  let y0 = start.Y
  let x1 = start.X + start.Width
  let y1 = start.Y + start.Height
  if (edit.corner.includes("w")) x0 += dx
  if (edit.corner.includes("e")) x1 += dx
  if (edit.corner.includes("n")) y0 += dy
  if (edit.corner.includes("s")) y1 += dy
  return roundBox({ X: Math.min(x0, x1), Y: Math.min(y0, y1), Width: Math.abs(x1 - x0), Height: Math.abs(y1 - y0) })
}

// median returns the middle value of a list of numbers.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.floor(sorted.length / 2)])
}

// PhotoViewer shows one photo with its card-name boxes drawn over it, and a
// strip of thumbnails to switch photos. Drag on the photo to draw a box, or
// Ctrl-click to drop one the size of the others. Click a box to select it,
// then drag it, drag a corner to resize it, or click its × to delete it.
//
// When onSideOut is set, Select mode turns a drag into a lasso: every named box
// whose center falls inside is selected, and "Side out" moves those cards to
// the sideboard. boxes are the current photo's boxes; sideboardNames are cards
// in the sideboard, drawn in blue. photoVersion gives a photo's rotation
// counter.
export function PhotoViewer({
  cube, draftId, photo, photos, onSelectPhoto,
  boxes, onDrawBox, onResizeBox, onDeleteBox,
  hoveredName, setHoveredName,
  onScan, onRotate, onClear, working, photoVersion,
  onSideOut, sideboardNames,
}) {
  const svgRef = useRef(null)
  const stageRef = useRef(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [edit, setEdit] = useState(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [selectMode, setSelectMode] = useState(false)
  const [lassoed, setLassoed] = useState(() => new Set())

  const photoBoxes = boxes || []
  const canSelect = Boolean(onSideOut)

  // A new photo starts unselected at the default zoom.
  useEffect(() => {
    setSelectedId(null)
    setLassoed(new Set())
    setZoom(DEFAULT_ZOOM)
  }, [photo])

  // Track the stage's size so the photo can fit inside it without distortion.
  useEffect(() => {
    const element = stageRef.current
    if (!element) {
      return undefined
    }
    const measure = () => setStage({ w: element.clientWidth, h: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // toImage converts a mouse event's position to photo pixel coordinates.
  function toImage(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = natural.w / rect.width
    const scaleY = natural.h / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  // While drawing, lassoing, moving or resizing, follow the mouse across the
  // whole window, so the drag survives leaving the photo.
  useEffect(() => {
    if (!drag && !edit) {
      return undefined
    }

    function onMove(e) {
      const point = toImage(e)
      if (drag) {
        setDrag((current) => ({ ...current, x1: point.x, y1: point.y }))
        return
      }
      const dx = point.x - edit.startPoint.x
      const dy = point.y - edit.startPoint.y
      setEdit((current) => ({ ...current, current: resizedBox(current, dx, dy) }))
    }

    function onUp() {
      if (drag && drag.lasso) {
        finishLasso()
      } else if (drag) {
        finishDraw()
      } else if (edit) {
        finishEdit()
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, edit])

  // finishLasso selects every named box whose center is inside the lasso.
  function finishLasso() {
    const area = boxFromDrag(drag)
    const hits = new Set()
    for (const box of photoBoxes) {
      if (!box.chosen) {
        continue
      }
      const centerX = box.bbox.X + box.bbox.Width / 2
      const centerY = box.bbox.Y + box.bbox.Height / 2
      const inside = centerX >= area.X && centerX <= area.X + area.Width && centerY >= area.Y && centerY <= area.Y + area.Height
      if (inside) {
        hits.add(box.id)
      }
    }
    setDrag(null)
    setLassoed(hits)
  }

  // finishDraw adds the drawn box, unless it's too small to be deliberate.
  function finishDraw() {
    const box = boxFromDrag(drag)
    setDrag(null)
    if (box.Width > 8 && box.Height > 6) {
      onDrawBox(box)
    }
  }

  // finishEdit saves a moved or resized box, if it changed.
  function finishEdit() {
    const done = edit
    setEdit(null)
    if (done.current && !sameBox(done.current, done.startBox)) {
      onResizeBox(done.id, done.current)
    }
  }

  // defaultBoxSize is the size of a Ctrl-click box: the median of this
  // photo's boxes, since name bars are all about the same size, or a wide,
  // short strip when there are none yet.
  function defaultBoxSize() {
    const sized = photoBoxes.map((box) => box.bbox).filter((bbox) => bbox && bbox.Width && bbox.Height)
    if (sized.length > 0) {
      return { w: median(sized.map((bbox) => bbox.Width)), h: median(sized.map((bbox) => bbox.Height)) }
    }
    return { w: Math.round(natural.w * 0.22), h: Math.round(natural.h * 0.04) }
  }

  // onPhotoMouseDown starts a lasso in Select mode, drops a default box on
  // Ctrl-click, and otherwise starts drawing a box.
  function onPhotoMouseDown(e) {
    if (!natural.w) {
      return
    }
    setSelectedId(null)
    const point = toImage(e)

    if (selectMode) {
      setDrag({ x0: point.x, y0: point.y, x1: point.x, y1: point.y, lasso: true })
      return
    }
    if (e.ctrlKey || e.metaKey) {
      const size = defaultBoxSize()
      onDrawBox({ X: Math.round(point.x), Y: Math.round(point.y - size.h / 2), Width: size.w, Height: size.h })
      return
    }
    setDrag({ x0: point.x, y0: point.y, x1: point.x, y1: point.y })
  }

  // onBoxMouseDown toggles a box in the lasso selection in Select mode, and
  // otherwise selects the box and starts moving it.
  function onBoxMouseDown(e, box, shown) {
    e.stopPropagation()
    if (selectMode) {
      if (!box.chosen) {
        return
      }
      const next = new Set(lassoed)
      if (next.has(box.id)) {
        next.delete(box.id)
      } else {
        next.add(box.id)
      }
      setLassoed(next)
      return
    }
    setSelectedId(box.id)
    setEdit({ type: "move", id: box.id, startBox: shown, startPoint: toImage(e) })
  }

  // sideOutLassoed moves the lassoed cards to the sideboard, one name per box
  // so two copies move two.
  function sideOutLassoed() {
    const names = photoBoxes.filter((box) => lassoed.has(box.id) && box.chosen).map((box) => box.chosen)
    if (names.length > 0) {
      onSideOut(names)
    }
    setLassoed(new Set())
    setSelectMode(false)
  }

  function toggleSelectMode() {
    setSelectMode(!selectMode)
    setLassoed(new Set())
  }

  // shownBox is where a box is drawn: its live position while being moved.
  function shownBox(box) {
    if (edit && edit.id === box.id && edit.current) {
      return edit.current
    }
    return box.bbox
  }

  // boxClass picks a box's outline: lassoed, selected, sideboard, then its
  // match status.
  function boxClass(box) {
    const classes = ["import-box"]
    if (lassoed.has(box.id)) {
      classes.push("lassoed")
    } else if (box.id === selectedId) {
      classes.push("selected")
    } else if (sideboardNames && box.chosen && sideboardNames.has(box.chosen)) {
      classes.push("sideboard")
    } else {
      classes.push(statusClass(box.status))
    }
    if (box.chosen && box.chosen === hoveredName) {
      classes.push("hot")
    }
    return classes.join(" ")
  }

  const zoomTo = (value) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2)))))

  // Line widths, handle sizes and label sizes scale with the photo, so they
  // look the same on a small photo and a 4000-pixel one.
  const stroke = Math.max(2, natural.w / 400)
  const handle = Math.max(7, natural.w / 110)
  const fontSize = Math.max(11, natural.w / 55)

  // At Fit (zoom 1) the photo fills as much of the stage as it can; past that
  // it grows and the stage scrolls.
  let fit = 0
  if (natural.w && stage.w && stage.h) {
    fit = Math.min(stage.w / natural.w, stage.h / natural.h)
  }
  let canvasStyle
  if (fit > 0) {
    canvasStyle = { width: `${Math.floor(natural.w * fit * zoom)}px` }
  }

  const version = (p) => (photoVersion ? photoVersion(p) : 0)

  return (
    <div className="import-viewer">
      <Group gap={6} className="import-viewer-tools">
        <ActionIcon variant="default" onClick={() => zoomTo(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out">
          <IconMinus size={16} />
        </ActionIcon>
        <Text size="sm" c="dimmed" className="import-zoom-level">{Math.round(zoom * 100)}%</Text>
        <ActionIcon variant="default" onClick={() => zoomTo(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in">
          <IconPlus size={16} />
        </ActionIcon>
        <Button size="xs" variant="default" onClick={() => zoomTo(1)} disabled={zoom === 1}>Fit</Button>
        <Tooltip label="Rotate left">
          <ActionIcon variant="default" onClick={() => onRotate("ccw")} disabled={working} aria-label="Rotate left">
            <IconRotate2 size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Rotate right">
          <ActionIcon variant="default" onClick={() => onRotate("cw")} disabled={working} aria-label="Rotate right">
            <IconRotateClockwise2 size={16} />
          </ActionIcon>
        </Tooltip>

        <Group gap={6} ml="auto">
          <Button size="xs" variant="default" onClick={onScan} loading={working}>Scan photo</Button>
          <Button size="xs" variant="default" onClick={onClear} disabled={working || photoBoxes.length === 0}>Clear</Button>
          {canSelect && (
            <Tooltip label="Drag over the photo to pick cards by position">
              <Button size="xs" variant={selectMode ? "light" : "default"} onClick={toggleSelectMode}>
                {selectMode ? "Selecting…" : "Select"}
              </Button>
            </Tooltip>
          )}
          {canSelect && selectMode && lassoed.size > 0 && (
            <Button size="xs" onClick={sideOutLassoed}>Side out {lassoed.size}</Button>
          )}
        </Group>
      </Group>

      <div className="import-stage" ref={stageRef}>
        <div className="import-canvas" style={canvasStyle}>
          <img
            src={photoURL(cube, draftId, photo, version(photo))}
            alt={photo}
            onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          />
          {natural.w > 0 && (
            <svg
              ref={svgRef}
              className={selectMode ? "import-overlay lasso" : "import-overlay"}
              viewBox={`0 0 ${natural.w} ${natural.h}`}
              preserveAspectRatio="none"
              onMouseDown={onPhotoMouseDown}
            >
              {photoBoxes.map((box) => {
                const shown = shownBox(box)
                const selected = box.id === selectedId
                const hot = Boolean(box.chosen) && box.chosen === hoveredName
                const labelled = selected || hot

                // Highlighted boxes draw thicker, and boxes still being read
                // draw dashed. Both scale with the photo.
                let width = stroke
                if (hot || selected || lassoed.has(box.id)) {
                  width = stroke * 1.8
                }
                let dashes
                if (box.status === "pending") {
                  dashes = `${stroke * 3} ${stroke * 2}`
                }
                return (
                  <g key={box.id}>
                    <rect
                      className={boxClass(box)}
                      x={shown.X}
                      y={shown.Y}
                      width={shown.Width}
                      height={shown.Height}
                      strokeWidth={width}
                      strokeDasharray={dashes}
                      onMouseEnter={() => box.chosen && setHoveredName(box.chosen)}
                      onMouseLeave={() => setHoveredName(null)}
                      onMouseDown={(e) => onBoxMouseDown(e, box, shown)}
                    />
                    {labelled && box.chosen && (
                      <text className="import-box-label" x={shown.X} y={Math.max(fontSize, shown.Y - stroke * 2)} fontSize={fontSize} strokeWidth={fontSize / 8}>
                        {box.chosen}
                      </text>
                    )}
                    {selected && (
                      <>
                        {CORNERS.map((corner) => {
                          const x = shown.X + (corner.includes("e") ? shown.Width : 0)
                          const y = shown.Y + (corner.includes("s") ? shown.Height : 0)
                          return (
                            <rect
                              key={corner}
                              className="import-box-handle"
                              x={x - handle / 2}
                              y={y - handle / 2}
                              width={handle}
                              height={handle}
                              strokeWidth={stroke / 2}
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                setEdit({ type: "resize", id: box.id, corner, startBox: shown, startPoint: toImage(e) })
                              }}
                            />
                          )
                        })}
                        <g
                          className="import-box-delete"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            onDeleteBox(box.id)
                            setSelectedId(null)
                          }}
                        >
                          <circle cx={shown.X + shown.Width} cy={shown.Y} r={handle} strokeWidth={stroke / 2} />
                          <text x={shown.X + shown.Width} y={shown.Y + handle * 0.4} fontSize={handle * 1.4} textAnchor="middle">×</text>
                        </g>
                      </>
                    )}
                  </g>
                )
              })}
              {drag && (
                <rect
                  className={drag.lasso ? "import-drag lasso" : "import-drag"}
                  x={Math.min(drag.x0, drag.x1)}
                  y={Math.min(drag.y0, drag.y1)}
                  width={Math.abs(drag.x1 - drag.x0)}
                  height={Math.abs(drag.y1 - drag.y0)}
                  strokeWidth={stroke}
                  strokeDasharray={`${stroke * 3} ${stroke * 2}`}
                />
              )}
            </svg>
          )}
        </div>
      </div>

      <div className="import-thumbs">
        {photos.map((p) => (
          <UnstyledButton key={p} className={p === photo ? "active" : ""} onClick={() => onSelectPhoto(p)}>
            <img src={photoURL(cube, draftId, p, version(p))} alt={p} />
          </UnstyledButton>
        ))}
      </div>
    </div>
  )
}
