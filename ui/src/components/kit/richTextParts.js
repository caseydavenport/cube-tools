// richTextParts turns a copy file's list of text parts into a uniform list
// RichText can render. It has no React in it, so node tests can load it.

// richTextParts takes a list where a string is plain text and { bold: "…" } is
// bold text, and returns each part as { bold, text }. COPY files write bold
// parts this way so a paragraph with bold words stays plain data.
export function richTextParts(parts) {
  const out = []
  for (const part of parts) {
    if (typeof part === "string") {
      out.push({ bold: false, text: part })
    } else {
      out.push({ bold: true, text: part.bold })
    }
  }
  return out
}
