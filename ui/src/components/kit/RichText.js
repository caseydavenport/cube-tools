// RichText renders a paragraph that COPY holds as a list of parts, so a page
// can keep its bold words in a copy file instead of inline JSX.

import React from "react"
import { richTextParts } from "./richTextParts.js"

// RichText renders each part of `parts` in order: a string as plain text and a
// { bold: "…" } part inside <b>. It returns a fragment, so the caller picks
// the wrapping element.
export function RichText({ parts }) {
  const pieces = richTextParts(parts).map((part, i) => {
    if (part.bold) {
      return <b key={i}>{part.text}</b>
    }
    return <React.Fragment key={i}>{part.text}</React.Fragment>
  })
  return <>{pieces}</>
}
