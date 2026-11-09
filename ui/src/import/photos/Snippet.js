import React, { useState } from "react"
import { photoURL } from "../importApi.js"

// statusClass is the CSS class that colors a box by how sure the card-name
// match is: gray while reading, green for a confident match, yellow for a
// shaky one, red when nothing matched. The photo overlay and the card lists
// share it, so a box reads the same in both.
export function statusClass(status) {
  if (status === "high") {
    return "import-status-high"
  }
  if (status === "low" || status === "very_low") {
    return "import-status-low"
  }
  if (status === "unmatched") {
    return "import-status-unmatched"
  }
  return "import-status-pending"
}

// sizeStyle is the inline width and height of a snippet. It's computed, so it
// stays inline.
function sizeStyle(width, height) {
  return { width: `${width}px`, height: `${height}px` }
}

// Snippet crops a card's name bar out of its photo into a fixed-size strip.
// Detected box heights vary wildly, so it scales by the box's width (about the
// width of a card) and centers on the box's middle, which keeps the name in
// view whatever height was detected. source is {photo, box}. photoVersion,
// when set, gives a photo's rotation counter, so a rotated photo reloads.
export function Snippet({ cube, draftId, source, photoVersion, width = 132, height = 30 }) {
  const [natural, setNatural] = useState(null)
  const photo = source && source.photo
  const box = source && source.box

  if (!photo || !box || !box.Width) {
    return <span className="import-snip empty" style={sizeStyle(width, height)} />
  }

  let version = 0
  if (photoVersion) {
    version = photoVersion(photo)
  }

  const scale = width / box.Width
  const centerY = box.Y + box.Height / 2

  // Until the photo loads its size is unknown, so it stays hidden.
  let imageClass = "loading"
  let imageStyle
  if (natural) {
    imageClass = undefined
    imageStyle = {
      width: `${natural.width * scale}px`,
      height: `${natural.height * scale}px`,
      left: `${-box.X * scale}px`,
      top: `${-centerY * scale + height / 2}px`,
    }
  }

  return (
    <span className="import-snip" style={sizeStyle(width, height)}>
      <img
        src={photoURL(cube, draftId, photo, version)}
        alt=""
        className={imageClass}
        style={imageStyle}
        onLoad={(e) => setNatural({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
      />
    </span>
  )
}
