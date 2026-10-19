import React, { useState } from "react"
import { ActionIcon, Button, Group, NumberInput, Popover, SegmentedControl, Select, Stack } from "@mantine/core"
import { IconPencil, IconTrash } from "@tabler/icons-react"
import { buildMatches, emptyRow, opponentOptions, seedRecordEditor } from "../../utils/RecordEditor.js"
import { useDraftDecks } from "../useDeckEdits.js"

// ScoreInput is one small number box in the record editor.
function ScoreInput({ label, value, onChange }) {
  return <NumberInput size="xs" w={56} min={0} hideControls aria-label={label} value={value} onChange={onChange} />
}

// RoundRow is one match in Rounds mode: the round, the opponent (from the
// draft's other decks), the game score, and a remove button.
function RoundRow({ row, options, onChange, onRemove, copy }) {
  const data = options.map(o => ({ value: String(o.id), label: o.player }))

  function onOpponent(value) {
    const opponent = options.find(o => String(o.id) === value)
    if (opponent) {
      onChange({ opponentId: opponent.id, opponent: opponent.player })
    } else {
      onChange({ opponentId: 0, opponent: "" })
    }
  }

  return (
    <Group gap={4} wrap="nowrap">
      <ScoreInput label={copy.round} value={row.round || ""} onChange={value => onChange({ round: value })} />
      <Select
        size="xs"
        w={140}
        placeholder={row.opponent || copy.opponent}
        aria-label={copy.opponent}
        data={data}
        value={row.opponentId ? String(row.opponentId) : null}
        onChange={onOpponent}
        comboboxProps={{ withinPortal: false }}
      />
      <ScoreInput label={copy.wins} value={row.wins} onChange={value => onChange({ wins: value })} />
      <ScoreInput label={copy.losses} value={row.losses} onChange={value => onChange({ losses: value })} />
      <ScoreInput label={copy.draws} value={row.draws} onChange={value => onChange({ draws: value })} />
      <ActionIcon variant="subtle" color="gray" size="sm" aria-label={copy.removeRound} onClick={onRemove}>
        <IconTrash size={14} />
      </ActionIcon>
    </Group>
  )
}

// RoundsForm lists every match as a RoundRow, with a button to add one.
function RoundsForm({ editor, setEditor, options, deck, copy }) {
  // updateRow merges changed fields into one row. The function form of
  // setEditor works from the latest state, so quick edits can't undo each other.
  function updateRow(index, fields) {
    setEditor(prev => ({ ...prev, rows: prev.rows.map((r, i) => (i === index ? { ...r, ...fields } : r)) }))
  }

  function removeRow(index) {
    setEditor(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }))
  }

  function addRow() {
    setEditor(prev => ({ ...prev, rows: [...prev.rows, emptyRow()] }))
  }

  return (
    <Stack gap={4}>
      {editor.rows.map((row, i) => (
        <RoundRow
          key={i}
          row={row}
          options={opponentOptions(options, deck, row)}
          onChange={fields => updateRow(i, fields)}
          onRemove={() => removeRow(i)}
          copy={copy}
        />
      ))}
      <Button variant="subtle" size="xs" onClick={addRow}>{copy.addRound}</Button>
    </Stack>
  )
}

// OverrideForm edits only the match win, loss, and draw totals.
function OverrideForm({ editor, setEditor, copy }) {
  function set(field, value) {
    setEditor(prev => ({ ...prev, override: { ...prev.override, [field]: value } }))
  }

  return (
    <Group gap={4}>
      <ScoreInput label={copy.wins} value={editor.override.wins} onChange={value => set("wins", value)} />
      <ScoreInput label={copy.losses} value={editor.override.losses} onChange={value => set("losses", value)} />
      <ScoreInput label={copy.draws} value={editor.override.draws} onChange={value => set("draws", value)} />
    </Group>
  )
}

// RecordForm is the record editor inside the popover. Rounds mode records each
// match against an opponent; Override mode sets only the totals.
function RecordForm({ cube, deck, edits, done, copy }) {
  const [editor, setEditor] = useState(() => seedRecordEditor(deck))
  const draftDecks = useDraftDecks(cube, deck, true)

  function save() {
    edits.saveRecord(copy.record, { matches: buildMatches(editor, deck) })
    done()
  }

  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        value={editor.mode}
        onChange={mode => setEditor(prev => ({ ...prev, mode }))}
        data={[
          { label: copy.rounds, value: "rounds" },
          { label: copy.override, value: "override" },
        ]}
      />

      {editor.mode === "rounds" && <RoundsForm editor={editor} setEditor={setEditor} options={draftDecks} deck={deck} copy={copy} />}
      {editor.mode === "override" && <OverrideForm editor={editor} setEditor={setEditor} copy={copy} />}

      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="xs" onClick={done}>{copy.cancel}</Button>
        <Button size="xs" onClick={save}>{copy.save}</Button>
      </Group>
    </Stack>
  )
}

// RecordEdit wraps the match record on the identity card. On writable cubes a
// pencil beside it opens the record editor in a popover anchored to the record.
// The editor is built fresh each time it opens, from the deck as saved.
export function RecordEdit({ cube, deck, edits, children, copy }) {
  const [opened, setOpened] = useState(false)

  if (!edits.editable) {
    return children
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" shadow="md" trapFocus>
      <Popover.Target>
        <span className="kit-editable deck-record-edit">
          {children}
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Edit ${copy.record}`} onClick={() => setOpened(!opened)}>
            <IconPencil size={14} />
          </ActionIcon>
        </span>
      </Popover.Target>
      <Popover.Dropdown>
        {opened && <RecordForm cube={cube} deck={deck} edits={edits} done={() => setOpened(false)} copy={copy} />}
      </Popover.Dropdown>
    </Popover>
  )
}
