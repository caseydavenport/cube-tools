// The Card explorer: search every card, or the cube's CubeCobra maybeboard,
// and see where each would sit in the rules. The server computes everything
// (/stats/explorer).

import React, { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { NumberInput, Switch, TextInput } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { startLoad } from "../stats/loading.js"
import { explorerUrl } from "../stats/pageRequests.js"
import { fetchJson } from "../utils/fetchJson.js"
import { ExplorerTable } from "./ExplorerTable.js"
import { readParams, writeParams } from "./explorerModel.js"
import "../stats/stats.css"
import "../pages/pages.css"
import "./explorer.css"

// useExplorer loads the explorer's answer for settings. It returns
// { data, loading, failed }; data is null until the first answer arrives.
function useExplorer(cube, settings) {
  const [state, setState] = useState({ data: null, loading: false, failed: false })
  const url = explorerUrl(cube, settings)
  useEffect(() => {
    setState(prev => ({ ...prev, loading: true, failed: false }))
    return startLoad(
      () => fetchJson(url),
      data => setState({ data, loading: false, failed: false }),
      () => setState({ data: null, loading: false, failed: true }),
    )
  }, [url])
  return state
}

// SearchBox holds the typed search and puts it in the URL on Enter or when
// the box loses focus, so each keystroke doesn't run a search.
function SearchBox({ value, onSearch }) {
  const [typed, setTyped] = useState(value)
  useEffect(() => {
    setTyped(value)
  }, [value])
  return (
    <TextInput
      size="xs"
      className="ex-search"
      placeholder='Search all cards, e.g. c:G cmc:3 t:creature tou>=4'
      value={typed}
      onChange={event => setTyped(event.target.value)}
      onKeyDown={event => {
        if (event.key === "Enter") {
          onSearch(typed)
        }
      }}
      onBlur={() => onSearch(typed)}
    />
  )
}

// ExplorerPage is the Card explorer page.
export function ExplorerPage() {
  const cube = useCube()
  const [params, setParams] = useSearchParams()
  const settings = readParams(params)
  const { data, loading, failed } = useExplorer(cube, settings)

  // update writes a change to the settings into the URL.
  function update(patch) {
    setParams(writeParams(params, patch), { replace: true })
  }

  const maybeboard = data ? data.maybeboard : { available: false }
  const toolbar = (
    <PageToolbar title="Card explorer">
      <SearchBox value={settings.q} onSearch={q => update({ q })} />
      {maybeboard.available && (
        <Switch size="xs" label="Maybeboard only" checked={settings.maybe} onChange={event => update({ maybe: event.currentTarget.checked })} />
      )}
      <NumberInput
        size="xs"
        className="ex-thin"
        label="Thin role"
        min={0}
        max={99}
        value={settings.thin}
        onChange={value => update({ thin: Number(value) || 0 })}
      />
      <Switch size="xs" label="Show cards in no group" checked={settings.all} onChange={event => update({ all: event.currentTarget.checked })} />
    </PageToolbar>
  )

  let body = null
  if (failed) {
    body = <div className="browse-empty">Couldn't run that search.</div>
  } else if (!data) {
    body = <div className="browse-empty">Loading…</div>
  } else if (!settings.q && !settings.maybe) {
    body = <div className="browse-empty">Search for cards to see where they'd fit.</div>
  } else {
    body = (
      <>
        {maybeboard.error && <div className="ex-note">{maybeboard.error}</div>}
        <SectionCard title={`Candidates · ${data.candidates.length}`} action={loading ? <span className="ex-note">Updating…</span> : null}>
          <ExplorerTable cards={data.candidates} cube={cube} thin={settings.thin} />
        </SectionCard>
        <SectionCard title={`In the cube · ${data.in_cube.length}`}>
          <ExplorerTable cards={data.in_cube} cube={cube} thin={settings.thin} />
        </SectionCard>
      </>
    )
  }

  return (
    <>
      {toolbar}
      <div className="analyze-page ex-page">{body}</div>
    </>
  )
}
