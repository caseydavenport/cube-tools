import React, { useState } from "react"
import { Alert, Button, FileInput, Group, Stack, Text, Textarea } from "@mantine/core"
import { useCube } from "../../contexts/CubeContext.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { parseDecklists } from "../importApi.js"
import { EventFields, eventProblem, newEvent } from "../EventFields.js"
import { HUB_CRUMB, ImportToolbar } from "../ImportToolbar.js"
import { useAction } from "../useAction.js"
import { DeckReview } from "./DeckReview.js"
import "../import.css"

// playerFromFilename guesses a deck's player from its file name the way the
// server does: drop the extension and anything after an underscore.
function playerFromFilename(name) {
  return name.split(".")[0].split("_")[0].toLowerCase()
}

// readSources turns the pasted text and the chosen files into the decklists
// the server parses. Pasted text is one deck with no player; each file is a
// deck whose player is guessed from its name.
async function readSources(text, files) {
  const sources = []
  if (text.trim()) {
    sources.push({ player: "", filename: "", content: text })
  }
  for (const file of files) {
    const content = await file.text()
    sources.push({ player: playerFromFilename(file.name), filename: file.name, content })
  }
  return sources
}

// DecklistImport brings a draft in from decklists: paste them or upload deck
// files, say which event they came from, then review and commit the parsed
// decks.
export default function DecklistImport() {
  const cube = useCube()
  const [text, setText] = useState("")
  const [files, setFiles] = useState([])
  const [event, setEvent] = useState(newEvent)
  const [parsed, setParsed] = useState(null)
  const parse = useAction()

  const trail = [HUB_CRUMB]

  if (parsed) {
    return (
      <>
        <ImportToolbar trail={[...trail, { label: "Decklists", path: "decklists" }]} title="Review" />
        <div className="analyze-page import-page">
          <DeckReview initialDecks={parsed.decks} initialReport={parsed.report} event={event} onBack={() => setParsed(null)} />
        </div>
      </>
    )
  }

  const hasDecks = text.trim().length > 0 || files.length > 0
  const problem = eventProblem(event)

  async function review() {
    const result = await parse.run(async () => parseDecklists(cube, await readSources(text, files)))
    if (result) {
      setParsed(result)
    }
  }

  return (
    <>
      <ImportToolbar trail={trail} title="Decklists" />
      <div className="analyze-page import-page">
        <SectionCard title="Decks">
          <Stack gap="sm">
            <Textarea
              label="Paste a decklist"
              description="One card per line, like “1 Snapcaster Mage”, or Delver Lens .csv text."
              autosize
              minRows={8}
              maxRows={20}
              classNames={{ input: "import-paste" }}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <FileInput
              label="Or upload deck files"
              description="One .txt or .csv file per player, named after them, like freddie.txt."
              placeholder="Choose files"
              multiple
              clearable
              accept=".txt,.csv"
              value={files}
              onChange={setFiles}
            />
          </Stack>
        </SectionCard>

        <SectionCard title="Event">
          <EventFields value={event} onChange={setEvent} />
        </SectionCard>

        {parse.error && <Alert color="red" variant="light">{parse.error}</Alert>}

        <Group justify="flex-end" gap="sm">
          {hasDecks && problem && <Text size="sm" c="dimmed">{problem}</Text>}
          <Button onClick={review} loading={parse.busy} disabled={!hasDecks || Boolean(problem)}>Review decks</Button>
        </Group>
      </div>
    </>
  )
}
