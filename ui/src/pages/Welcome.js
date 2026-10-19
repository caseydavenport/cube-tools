import React, { useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Stack, Text } from "@mantine/core"
import { SITE_NAME } from "../brand.js"
import { WelcomeTopBar } from "../welcome/WelcomeTopBar.js"
import { Hero } from "../welcome/Hero.js"
import { CubeCards } from "../welcome/CubeCards.js"
import { FeatureTiles } from "../welcome/FeatureTiles.js"
import "../components/kit/kit.css"
import "../welcome/welcome.css"

// COPY holds every piece of text on the welcome page, so it can be rewritten in
// one place. These are placeholders.
const COPY = {
  title: SITE_NAME,
  pitch: "Draft stats for our cube nights.",
  inputPlaceholder: "Paste a CubeCobra link or ID",
  inputError: "Not a CubeCobra link or ID",
  open: "Open",
  cubesLabel: "Cubes",
  featuresLabel: "What you can do here",
  drafts: "drafts",
  decks: "decks",
  anyCube: "Any CubeCobra cube",
  anyCubeDetail: "Card stats and design tools, no drafts needed",
  decksTitle: "Browse decks",
  decksText: "Every deck from every draft.",
  winsTitle: "See what wins",
  winsText: "Win rates for cards, colors, and archetypes.",
  mapTitle: "Synergy map",
  mapText: "The cube's themes, drawn as a graph.",
  importTitle: "Import from photos",
  importText: "Turn deck photos into decklists.",
}

// SectionLabel is the small uppercase heading above each welcome page section.
function SectionLabel({ children }) {
  return <Text className="welcome-section-label">{children}</Text>
}

// Welcome is the site's front door at /: a hero with a box for opening any
// CubeCobra cube, the cubes hosted here, and highlights of what the site does.
export default function Welcome() {
  const navigate = useNavigate()

  // The CubeCobra box lives in the hero, but the "Any CubeCobra cube" card
  // further down also needs to move the cursor into it.
  const cubeCobraInput = useRef(null)

  function openCubeCobra(id) {
    navigate(`/cc:${id}`)
  }

  function focusCubeCobraInput() {
    if (cubeCobraInput.current) {
      cubeCobraInput.current.focus()
      cubeCobraInput.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  return (
    <div className="welcome-page">
      <WelcomeTopBar />

      <Stack gap="lg" className="welcome-content">
        <Hero copy={COPY} inputRef={cubeCobraInput} onOpenCubeCobra={openCubeCobra} />

        <div>
          <SectionLabel>{COPY.cubesLabel}</SectionLabel>
          <CubeCards copy={COPY} onPickCubeCobra={focusCubeCobraInput} />
        </div>

        <div>
          <SectionLabel>{COPY.featuresLabel}</SectionLabel>
          <FeatureTiles copy={COPY} />
        </div>
      </Stack>
    </div>
  )
}
