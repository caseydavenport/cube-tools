// richTextParts takes a copy file's list of text parts, where a string is
// plain text and { bold: "…" } is bold text, and returns each part as
// { bold, text }. It has no React in it, so node tests can load it.
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
