// useCubeTags loads the cube's Scryfall tags from /stats/tags, for the group
// editor's tag picker and the Cards page's tag panel and filter.

import { useLoaded } from "./useLoaded.js"
import { statsUrl } from "./statsUrls.js"
import { fetchJson } from "../utils/fetchJson.js"

// NO_TAGS is the answer shown until the cube's tags arrive.
const NO_TAGS = { total: 0, tags: [], distinctive: [] }

// useCubeTags returns the cube's tags: tags (most cube cards first) and
// distinctive (most over-represented against all of Magic first).
export function useCubeTags(cube) {
  const loaded = useLoaded(cube, true, () => fetchJson(statsUrl(cube, "tags", {})), [], NO_TAGS)
  return loaded.value
}
