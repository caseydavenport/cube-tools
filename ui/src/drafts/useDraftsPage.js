import { useEffect, useMemo, useState } from "react"
import { useSelection } from "../hooks/useSelection.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { fetchJson } from "../utils/fetchJson.js"
import { draftList } from "./draftList.js"

// useFetched fetches a JSON url and holds { data, error }. It refetches when the
// url changes, and drops the answer to an older url that arrives late. A null
// url fetches nothing.
function useFetched(url) {
  const [state, setState] = useState({ url: null, data: null, error: null })

  useEffect(() => {
    if (!url) {
      return
    }

    let alive = true
    fetchJson(url)
      .then(data => {
        if (alive) {
          setState({ url, data, error: null })
        }
      })
      .catch(error => {
        if (alive) {
          setState({ url, data: null, error })
        }
      })
    return () => {
      alive = false
    }
  }, [url])

  // An answer for another url (the previous selection) isn't shown.
  if (state.url !== url) {
    return { data: null, error: null }
  }
  return state
}

// useDraftsPage loads what the Drafts page shows: the drafts in the date range
// with their winners, the selected draft (?draft= in the URL), and that draft's
// pick log, fetched only once it's selected. props carry the app-wide dates.
export function useDraftsPage(cube, props) {
  const [selectedId, select] = useSelection("draft")
  const info = useCubeInfo(cube)

  const index = useFetched(`/api/${cube}/index`)
  const summary = useFetched(`/api/${cube}/decks/summary`)

  const drafts = useMemo(() => {
    let decks = []
    if (summary.data && summary.data.decks) {
      decks = summary.data.decks
    }
    return draftList(index.data, decks, props.startDate, props.endDate)
  }, [index.data, summary.data, props.startDate, props.endDate])

  const selected = drafts.find(d => String(d.id) === selectedId) || null

  let logUrl = null
  if (selected && selected.hasLog) {
    logUrl = `/api/${cube}/drafts/${selected.id}/log`
  }
  const log = useFetched(logUrl)

  return {
    cube,
    drafts,
    loading: !index.data && !index.error,
    error: index.error || summary.error,
    selectedId,
    select: id => select(String(id)),
    selected,
    log,
    cubeHasLogs: info.pick_logs,
  }
}
