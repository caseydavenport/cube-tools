import React, { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Button, Group, Menu, Text, TextInput, UnstyledButton } from "@mantine/core"
import { IconRefresh, IconSelector } from "@tabler/icons-react"
import { switchCubeInPath } from "./paths.js"

// CubeCobra cubes have ids like "cc:polyversal"; local cubes have plain ids.
const CC_PREFIX = "cc:"

// isCubeCobra reports whether a cube id names a CubeCobra cube.
function isCubeCobra(cube) {
  return cube.startsWith(CC_PREFIX)
}

// cubeDisplayName picks the name to show for a cube: its configured name for a
// local cube, or the bare CubeCobra id, since CubeCobra cubes aren't configured.
function cubeDisplayName(cube, meta) {
  if (meta) {
    return meta.name
  }
  if (isCubeCobra(cube)) {
    return cube.slice(CC_PREFIX.length)
  }
  return cube
}

// useCubeList loads the configured local cubes from /api/cubes. It returns an
// empty list until they arrive, or if the request fails.
function useCubeList() {
  const [cubes, setCubes] = useState([])

  useEffect(() => {
    fetch("/api/cubes")
      .then(r => r.json())
      .then(data => setCubes(data.cubes || []))
      .catch(() => setCubes([]))
  }, [])

  return cubes
}

// useCubeCobraRefresh re-imports a cube's card list from CubeCobra. It returns
// whether a refresh is running, a short result message, and the refresh
// function. The message clears when the cube changes.
function useCubeCobraRefresh(cube) {
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState(null)

  // currentCube always holds the cube on screen now, so a refresh that finishes
  // after the viewer switched cubes can tell its result is out of date.
  const currentCube = useRef(cube)
  currentCube.current = cube

  useEffect(() => {
    setMessage(null)
  }, [cube])

  // refresh posts to the server, then shows the result, unless the viewer has
  // moved to another cube by then.
  async function refresh() {
    const startedFor = cube
    setRefreshing(true)
    setMessage(null)

    let result
    try {
      const r = await fetch(`/api/${cube}/refresh`, { method: "POST" })
      if (!r.ok) {
        throw new Error(await r.text())
      }
      const data = await r.json()
      result = `Updated: ${data.cards} cards`
    } catch (err) {
      result = `Refresh failed: ${String(err)}`
    }

    setRefreshing(false)
    if (startedFor === currentCube.current) {
      setMessage(result)
    }
  }

  return { refreshing, message, refresh }
}

// SwitcherButton is what the sidebar shows for the current cube: a logo square,
// and when expanded, the cube's name and where it comes from. Menu.Target hands
// it a click handler and ref as extra props, which must reach the button.
function SwitcherButton({ name, isCC, collapsed, ...menuTargetProps }) {
  return (
    <UnstyledButton {...menuTargetProps} className="se-switcher" aria-label="Switch cube">
      <div className="se-logo" />
      {!collapsed && (
        <>
          <div className="se-switcher-text">
            <Text fw={600} size="sm" truncate>{name}</Text>
            <Text size="xs" c="dimmed">{isCC ? "CubeCobra" : "Local cube"}</Text>
          </div>
          <IconSelector size={16} stroke={1.5} className="se-muted" />
        </>
      )}
    </UnstyledButton>
  )
}

// OpenCubeCobraForm is the menu's text box for opening any CubeCobra cube by id.
function OpenCubeCobraForm({ onOpen }) {
  const [id, setId] = useState("")

  function submit(e) {
    e.preventDefault()
    const trimmed = id.trim()
    if (trimmed === "") {
      return
    }
    setId("")
    onOpen(trimmed)
  }

  return (
    <form onSubmit={submit} className="se-cc-form">
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs"
          placeholder="CubeCobra ID"
          value={id}
          onChange={e => setId(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button size="xs" type="submit">Open</Button>
      </Group>
    </form>
  )
}

// RefreshItem is the menu entry that re-imports the cube's card list from
// CubeCobra, with the result shown underneath. The menu stays open so the
// result is visible.
function RefreshItem({ refreshing, message, onRefresh }) {
  return (
    <>
      <Menu.Item
        leftSection={<IconRefresh size={16} stroke={1.5} />}
        onClick={onRefresh}
        disabled={refreshing}
        closeMenuOnClick={false}
      >
        {refreshing ? "Refreshing…" : "Refresh from CubeCobra"}
      </Menu.Item>
      {message && <Text size="xs" c="dimmed" px="sm" pb={6}>{message}</Text>}
    </>
  )
}

// CubeSwitcher shows the current cube at the top of the sidebar and opens a menu
// to switch cubes, open a CubeCobra cube by id, or refresh this cube's card list
// from CubeCobra.
export function CubeSwitcher({ cube, collapsed }) {
  const cubes = useCubeList()
  const { refreshing, message, refresh } = useCubeCobraRefresh(cube)
  const location = useLocation()
  const navigate = useNavigate()

  const meta = cubes.find(c => c.id === cube)
  const canRefresh = Boolean(meta && meta.cubecobra_id)

  // Switching to another local cube keeps the current page.
  function switchTo(next) {
    navigate(switchCubeInPath(location.pathname, next))
  }

  // Opening a CubeCobra cube goes to its home page.
  function openCubeCobra(id) {
    navigate("/" + CC_PREFIX + id)
  }

  return (
    <Menu position={collapsed ? "right-start" : "bottom-start"} width={240} withinPortal>
      <Menu.Target>
        <SwitcherButton name={cubeDisplayName(cube, meta)} isCC={isCubeCobra(cube)} collapsed={collapsed} />
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Cubes</Menu.Label>
        {cubes.map(c => (
          <Menu.Item key={c.id} onClick={() => switchTo(c.id)} fw={c.id === cube ? 600 : undefined}>
            {c.name}
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Label>CubeCobra</Menu.Label>
        <OpenCubeCobraForm onOpen={openCubeCobra} />

        {canRefresh && (
          <>
            <Menu.Divider />
            <RefreshItem refreshing={refreshing} message={message} onRefresh={refresh} />
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
