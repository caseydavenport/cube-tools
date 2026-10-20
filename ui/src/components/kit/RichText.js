import React from "react"
import { richTextParts } from "./richTextParts.js"

// RichText renders a paragraph that COPY holds as a list of parts, so bold
// words live in the copy file. A string is plain text and { bold: "…" } goes
// inside <b>. It returns a fragment, so the caller picks the wrapping element.
export function RichText({ parts }) {
  const pieces = richTextParts(parts).map((part, i) => {
    if (part.bold) {
      return <b key={i}>{part.text}</b>
    }
    return <React.Fragment key={i}>{part.text}</React.Fragment>
  })
  return <>{pieces}</>
}
