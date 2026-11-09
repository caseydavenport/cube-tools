import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Alert, Button, FileButton, Group, Stack, Text } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { createPhotoDraft } from "./importApi.js"
import { EventFields, eventProblem, newEvent } from "./EventFields.js"
import { HUB_CRUMB, ImportToolbar } from "./ImportToolbar.js"
import { useAction } from "./useAction.js"
import "./import.css"

// IMAGE_PATTERN matches the photo files a folder upload keeps.
const IMAGE_PATTERN = /\.(jpe?g|png)$/i

// photosIn keeps the image files from a folder pick, sorted by name. The
// server seats players in that same order, so the first photo is p1.
function photosIn(fileList) {
  const photos = Array.from(fileList || []).filter((file) => IMAGE_PATTERN.test(file.name))
  photos.sort((a, b) => a.name.localeCompare(b.name))
  return photos
}

// folderPickerProps turn a file input into a folder picker. The attributes
// aren't standard React props, so they pass straight through to the input.
const folderPickerProps = { webkitdirectory: "", directory: "" }

// PhotoFolderImport builds a draft from a folder of deck photos, one per
// player, then opens the draft's photo review to read the cards off them.
export default function PhotoFolderImport() {
  const cube = useCube()
  const navigate = useNavigate()
  const [photos, setPhotos] = useState([])
  const [event, setEvent] = useState(newEvent)
  const action = useAction()

  const problem = eventProblem(event)

  async function create() {
    const fields = { date: event.date, slug: event.eventCode, event_name: event.eventName, flight: event.flight }
    const draftId = await action.run(() => createPhotoDraft(cube, fields, photos))
    if (draftId) {
      navigate(`/${cube}/import/review/${draftId}`)
    }
  }

  return (
    <>
      <ImportToolbar trail={[HUB_CRUMB]} title="Photo folder" />
      <div className="analyze-page import-page">
        <SectionCard title="Photos">
          <Stack gap="xs">
            <Group gap="sm">
              <FileButton onChange={(files) => setPhotos(photosIn(files))} multiple accept="image/*" inputProps={folderPickerProps}>
                {(props) => <Button variant="default" {...props}>Choose a folder</Button>}
              </FileButton>
              <Text size="sm" c="dimmed">One photo per player's deck. Players are seated in file name order.</Text>
            </Group>
            {photos.length > 0 && (
              <ol className="import-photo-files">
                {photos.map((photo, i) => <li key={photo.name}>p{i + 1}: {photo.name}</li>)}
              </ol>
            )}
          </Stack>
        </SectionCard>

        <SectionCard title="Event">
          <EventFields value={event} onChange={setEvent} withFlight />
        </SectionCard>

        {action.error && <Alert color="red" variant="light">{action.error}</Alert>}

        <Group justify="flex-end" gap="sm">
          {photos.length > 0 && problem && <Text size="sm" c="dimmed">{problem}</Text>}
          <Button onClick={create} loading={action.busy} disabled={photos.length === 0 || Boolean(problem)}>Create draft</Button>
        </Group>
      </div>
    </>
  )
}
