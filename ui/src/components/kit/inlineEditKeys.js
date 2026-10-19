// inlineEditKeys says what a key press means inside an inline text editor:
// Enter saves, Escape cancels, and any other key is just typing. Every pencil
// editor uses it, so they all behave the same way.
export function inlineEditKeys(key) {
  if (key === "Enter") {
    return "save"
  }
  if (key === "Escape") {
    return "cancel"
  }
  return null
}
