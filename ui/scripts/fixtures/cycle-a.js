// Half of an import cycle with cycle-b.js.
import { b } from "./cycle-b.js"

export function a() {
  return b()
}
