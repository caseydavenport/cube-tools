// React hooks that ask the server about the search language: the keywords a
// search bar offers, whether a search parses, and which decklist cards a deck
// search marks.

import { useEffect, useState } from "react"
import { fetchJson } from "../utils/fetchJson.js"

// CHECK_DELAY_MS is how long the search bar waits after typing stops before
// asking whether the search parses.
const CHECK_DELAY_MS = 300

// keywordRequests caches each target's keyword list for the session; the
// table only changes when the server does.
const keywordRequests = new Map()

// loadKeywords fetches a target's keywords once and shares the answer.
function loadKeywords(target) {
  if (!keywordRequests.has(target)) {
    const request = fetchJson(`/api/search/keywords?target=${target}`).catch(() => {
      keywordRequests.delete(target)
      return []
    })
    keywordRequests.set(target, request)
  }
  return keywordRequests.get(target)
}

// useSearchKeywords returns the keywords a search target accepts ("decks",
// "cards" or "rules"), or an empty list until they load.
export function useSearchKeywords(target) {
  const [keywords, setKeywords] = useState([])
  useEffect(() => {
    let live = true
    loadKeywords(target).then(list => {
      if (live) {
        setKeywords(list)
      }
    })
    return () => {
      live = false
    }
  }, [target])
  return keywords
}

// useSearchError returns why a search doesn't parse, or "" when it does. It
// asks the server a moment after typing stops.
export function useSearchError(value, target) {
  const [error, setError] = useState("")
  useEffect(() => {
    if (!value || !value.trim()) {
      setError("")
      return undefined
    }
    let live = true
    const timer = setTimeout(() => {
      const url = `/api/search/check?target=${target}&q=${encodeURIComponent(value)}`
      fetchJson(url)
        .then(resp => {
          if (live) {
            setError(resp.error || "")
          }
        })
        .catch(() => {})
    }, CHECK_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [value, target])
  return error
}

// useHighlights returns the set of card names a decklist should mark for a
// deck search, or an empty set when there's no search.
export function useHighlights(matchStr, names) {
  const [marked, setMarked] = useState(new Set())
  const key = names.join("\n")
  useEffect(() => {
    if (!matchStr || !matchStr.trim() || names.length === 0) {
      setMarked(new Set())
      return undefined
    }
    let live = true
    const body = JSON.stringify({ q: matchStr, names })
    fetchJson("/api/search/highlight", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then(resp => {
        if (live) {
          setMarked(new Set(resp.names || []))
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [matchStr, key])
  return marked
}
