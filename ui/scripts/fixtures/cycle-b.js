// The other half of an import cycle with cycle-a.js.
import { a } from "./cycle-a.js"

export function b() {
  return a
}
