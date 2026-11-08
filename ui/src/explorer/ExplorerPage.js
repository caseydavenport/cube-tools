// The Card explorer: search every card, or the cube's CubeCobra maybeboard,
// and see where each would sit in the rules. The server computes, sorts and
// pages everything (/stats/explorer).

import React, { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { NumberInput, Switch, TextInput } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { startLoad } from "../stats/loading.js"
import { explorerUrl } from "../stats/pageRequests.js"
import { fetchJson } from "../utils/fetchJson.js"
import { CubeGrid } from "./CubeGrid.js"
import { ExplorerTable, PAGE_SIZE } from "./ExplorerTable.js"
import { DEFAULT_THIN, readParams, writeParams } from "./explorerModel.js"
import "../stats/stats.css"
import "../pages/pages.css"
import "./explorer.css"

// CUBE_GRID_LIMIT is how many cube cards the opening grid asks for: more than
// any cube holds.
const CUBE_GRID_LIMIT = 1000

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
      () => setState(prev => ({ ...prev, loading: false, failed: true })),
    )
  }, [url])
  return state
}

// useRowLimit is how many rows of each table to ask for: PAGE_SIZE, growing
// by PAGE_SIZE with each Show more, and back to PAGE_SIZE whenever the search
// or sort changes. key identifies the search and sort.
function useRowLimit(key) {
  const [rows, setRows] = useState({ key, limit: PAGE_SIZE })
  const limit = rows.key === key ? rows.limit : PAGE_SIZE
  return [limit, () => setRows({ key, limit: limit + PAGE_SIZE })]
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
      placeholder='Search all cards, e.g. c:G mv=3 t:creature tou>=4'
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

// ThinInput holds the typed thin-role cutoff and puts it in the URL on Enter
// or when the box loses focus, like the search. An empty box means the
// default.
function ThinInput({ value, onChange }) {
  const [typed, setTyped] = useState(value)
  useEffect(() => {
    setTyped(value)
  }, [value])

  // commit sends the typed cutoff, or the default for an empty box.
  function commit() {
    let next = Number(typed)
    if (typed === "" || Number.isNaN(next)) {
      next = DEFAULT_THIN
    }
    setTyped(next)
    onChange(next)
  }

  return (
    <NumberInput
      size="xs"
      className="ex-thin"
      label="Thin role"
      min={0}
      max={99}
      value={typed}
      onChange={setTyped}
      onKeyDown={event => {
        if (event.key === "Enter") {
          commit()
        }
      }}
      onBlur={commit}
    />
  )
}

// ExplorerPage is the Card explorer page.
export function ExplorerPage() {
  const cube = useCube()
  const [params, setParams] = useSearchParams()
  const settings = readParams(params)
  const [limit, showMore] = useRowLimit(explorerUrl(cube, settings))

  // With no search, the page opens on the whole cube as a grid, so it asks for
  // every cube card at once.
  const landing = !settings.q && !settings.maybe
  const { data, loading, failed } = useExplorer(cube, { ...settings, limit: landing ? CUBE_GRID_LIMIT : limit })

  // update writes a change to the settings into the URL.
  function update(patch) {
    setParams(writeParams(params, patch), { replace: true })
  }

  // setSort takes a sort, or a function of the current one, as the table's
  // headers pass.
  function setSort(next) {
    if (typeof next === "function") {
      next = next(settings.sort)
    }
    update({ sort: next })
  }

  const maybeboard = data ? data.maybeboard : { available: false }
  const toolbar = (
    <PageToolbar title="Card explorer">
      <SearchBox value={settings.q} onSearch={q => update({ q })} />
      {maybeboard.available && (
        <Switch size="xs" label="Maybeboard only" checked={settings.maybe} onChange={event => update({ maybe: event.currentTarget.checked })} />
      )}
      <ThinInput value={settings.thin} onChange={thin => update({ thin })} />
      <Switch size="xs" label="Show cards in no group" checked={settings.all} onChange={event => update({ all: event.currentTarget.checked })} />
    </PageToolbar>
  )

  const tableProps = { cube, thin: settings.thin, sort: settings.sort, setSort, onMore: showMore }
  let body = null
  if (failed) {
    body = <div className="browse-empty">Couldn't run that search.</div>
  } else if (!data) {
    body = <div className="browse-empty">Loading…</div>
  } else if (landing) {
    body = <CubeGrid cards={data.in_cube} total={data.in_cube_total} onPick={name => update({ q: `!"${name}"` })} />
  } else {
    body = (
      <>
        {maybeboard.error && <div className="ex-note">{maybeboard.error}</div>}
        {(data.candidates_total > 0 || data.in_cube_total === 0) && (
          <SectionCard title={`Candidates · ${data.candidates_total}`} action={loading ? <span className="ex-note">Updating…</span> : null}>
            <ExplorerTable cards={data.candidates} total={data.candidates_total} {...tableProps} />
          </SectionCard>
        )}
        {data.in_cube_total > 0 && (
          <SectionCard title={`In the cube · ${data.in_cube_total}`}>
            <ExplorerTable cards={data.in_cube} total={data.in_cube_total} {...tableProps} />
          </SectionCard>
        )}
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
