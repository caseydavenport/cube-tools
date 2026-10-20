import { SHARED } from "./shared.js"

const COPY = { ...SHARED, table: { win: "Win%" } }

export function Header() {
  return [COPY.fromShared, COPY.table.win]
}
