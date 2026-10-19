import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { SimpleGrid, Text, UnstyledButton } from "@mantine/core"
import { IconPlus } from "@tabler/icons-react"
import { EmptyState } from "../components/kit/EmptyState.js"
import { MANA, PRIMARY_SHADES } from "../theme/tokens.js"
import { fetchJson } from "../utils/fetchJson.js"

// BANDS are the gradient stripes across the top of each cube card, used in turn.
const BANDS = [
  `linear-gradient(90deg, ${MANA.U}, ${MANA.B}, ${MANA.R})`,
  `linear-gradient(90deg, ${PRIMARY_SHADES[3]}, ${PRIMARY_SHADES[2]}, ${MANA.R})`,
  `linear-gradient(90deg, ${MANA.G}, ${MANA.U})`,
]

// countsFrom turns a cube's draft index into its draft and deck counts.
function countsFrom(index) {
  const drafts = index.drafts || []
  let decks = 0
  for (const draft of drafts) {
    decks += draft.decks.length
  }
  return { drafts: drafts.length, decks }
}

// loadCounts fetches each cube's draft index and reports its counts through
// onCounts as each one arrives. A cube whose index fails just shows no counts.
// isStale says whether the page has gone away, so late answers are dropped.
function loadCounts(cubes, onCounts, isStale) {
  for (const cube of cubes) {
    fetchJson(`/api/${cube.id}/index`)
      .then(index => {
        if (!isStale()) {
          onCounts(cube.id, countsFrom(index))
        }
      })
      .catch(() => {})
  }
}

// useHostedCubes loads the cubes this site hosts, then each one's draft and deck
// counts. failed is true when the cube list itself couldn't load.
function useHostedCubes() {
  const [cubes, setCubes] = useState([])
  const [counts, setCounts] = useState({})
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // The cleanup below marks these requests stale if the page goes away.
    let stale = false
    const isStale = () => stale

    function addCounts(cubeId, cubeCounts) {
      setCounts(prev => ({ ...prev, [cubeId]: cubeCounts }))
    }

    fetchJson("/api/cubes")
      .then(data => {
        if (stale) {
          return
        }
        const list = data.cubes || []
        setCubes(list)
        loadCounts(list, addCounts, isStale)
      })
      .catch(() => {
        if (!stale) {
          setFailed(true)
        }
      })

    return () => {
      stale = true
    }
  }, [])

  return { cubes, counts, failed }
}

// CubeCard is one hosted cube: a colored band, its name, description, and counts.
function CubeCard({ cube, counts, band, copy }) {
  const details = []
  if (cube.description) {
    details.push(cube.description)
  }
  if (counts) {
    details.push(`${counts.drafts} ${copy.drafts}`, `${counts.decks} ${copy.decks}`)
  }
  const detail = details.join(" · ")

  return (
    <UnstyledButton component={Link} to={`/${cube.id}`} className="kit-card welcome-cube-card">
      <div className="welcome-cube-band" style={{ background: band }} />
      <div className="welcome-cube-body">
        <Text fw={700}>{cube.name}</Text>
        <Text className="welcome-muted">{detail}</Text>
      </div>
    </UnstyledButton>
  )
}

// AnyCubeCobraCard is the dashed card for opening a cube that isn't hosted
// here. Clicking it moves the cursor to the hero's CubeCobra box.
function AnyCubeCobraCard({ copy, onPick }) {
  return (
    <UnstyledButton onClick={onPick} className="kit-card welcome-cube-card welcome-cube-any">
      <div className="welcome-cube-band welcome-cube-band-any">
        <IconPlus size={18} stroke={1.6} />
      </div>
      <div className="welcome-cube-body">
        <Text fw={700}>{copy.anyCube}</Text>
        <Text className="welcome-muted">{copy.anyCubeDetail}</Text>
      </div>
    </UnstyledButton>
  )
}

// CubeCards lists the hosted cubes, then the card for any CubeCobra cube. If
// the cube list fails to load, a short message takes the hosted cubes' place.
export function CubeCards({ copy, onPickCubeCobra }) {
  const { cubes, counts, failed } = useHostedCubes()

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
      {failed && <EmptyState>{copy.cubesError}</EmptyState>}
      {cubes.map((cube, i) => (
        <CubeCard key={cube.id} cube={cube} counts={counts[cube.id]} band={BANDS[i % BANDS.length]} copy={copy} />
      ))}
      <AnyCubeCobraCard copy={copy} onPick={onPickCubeCobra} />
    </SimpleGrid>
  )
}
