import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { SimpleGrid, Text, UnstyledButton } from "@mantine/core"
import { IconPlus } from "@tabler/icons-react"
import { MANA, PRIMARY_SHADES } from "../theme/tokens.js"

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

// useHostedCubes loads the cubes this site hosts and, for each, its draft and
// deck counts. Counts fill in per cube as their requests answer.
function useHostedCubes() {
  const [cubes, setCubes] = useState([])
  const [counts, setCounts] = useState({})

  useEffect(() => {
    fetch("/api/cubes")
      .then(r => r.json())
      .then(data => {
        const list = data.cubes || []
        setCubes(list)

        for (const cube of list) {
          fetch(`/api/${cube.id}/index`)
            .then(r => r.json())
            .then(index => setCounts(prev => ({ ...prev, [cube.id]: countsFrom(index) })))
            .catch(() => {})
        }
      })
      .catch(() => setCubes([]))
  }, [])

  return { cubes, counts }
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

// CubeCards lists the hosted cubes, then the card for any CubeCobra cube.
export function CubeCards({ copy, onPickCubeCobra }) {
  const { cubes, counts } = useHostedCubes()

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
      {cubes.map((cube, i) => (
        <CubeCard key={cube.id} cube={cube} counts={counts[cube.id]} band={BANDS[i % BANDS.length]} copy={copy} />
      ))}
      <AnyCubeCobraCard copy={copy} onPick={onPickCubeCobra} />
    </SimpleGrid>
  )
}
