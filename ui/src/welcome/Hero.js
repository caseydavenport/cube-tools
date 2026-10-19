import React, { useState } from "react"
import { Button, Group, Text, TextInput, Title } from "@mantine/core"
import { IconLink } from "@tabler/icons-react"
import { parseCubeCobraInput } from "./cubecobra.js"

// CubeCobraBar is the hero's box for opening any CubeCobra cube from a link or
// id. Text that isn't either shows an error under the box and goes nowhere.
function CubeCobraBar({ copy, inputRef, onOpen }) {
  const [text, setText] = useState("")
  const [invalid, setInvalid] = useState(false)

  function submit(e) {
    e.preventDefault()
    const id = parseCubeCobraInput(text)
    if (id === null) {
      setInvalid(true)
      return
    }
    onOpen(id)
  }

  function change(e) {
    setText(e.currentTarget.value)
    setInvalid(false)
  }

  return (
    <form onSubmit={submit}>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <TextInput
          ref={inputRef}
          className="welcome-cc-input"
          leftSection={<IconLink size={16} stroke={1.6} />}
          placeholder={copy.inputPlaceholder}
          value={text}
          onChange={change}
          error={invalid ? copy.inputError : null}
        />
        <Button type="submit">{copy.open}</Button>
      </Group>
    </form>
  )
}

// Hero is the top band of the welcome page: the title, a one-line pitch, and the
// CubeCobra box. Its right side is left free for a future player search.
export function Hero({ copy, inputRef, onOpenCubeCobra }) {
  return (
    <section className="welcome-hero">
      <div className="welcome-hero-main">
        <Title order={1} className="welcome-title">{copy.title}</Title>
        <Text className="welcome-pitch">{copy.pitch}</Text>
        <CubeCobraBar copy={copy} inputRef={inputRef} onOpen={onOpenCubeCobra} />
      </div>
    </section>
  )
}
