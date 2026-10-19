import React, { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Button, Group, Menu, Text, TextInput, UnstyledButton } from "@mantine/core"
import { IconRefresh, IconSelector } from "@tabler/icons-react"

const CC_PREFIX = "cc:"

// CubeSwitcher shows the current cube at the top of the sidebar and opens a menu
// to switch cubes, open a CubeCobra cube by id, or refresh this cube's card list
// from CubeCobra. Switching keeps the current page.
export function CubeSwitcher({ cube, collapsed }) {
  const [cubes, setCubes] = useState([])
  const [ccInput, setCcInput] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    fetch("/api/cubes")
      .then(r => r.json())
      .then(data => setCubes(data.cubes || []))
      .catch(() => setCubes([]))
  }, [])

  useEffect(() => setRefreshMsg(null), [cube])

  const isCC = cube.startsWith(CC_PREFIX)
  const meta = cubes.find(c => c.id === cube)
  const name = meta ? meta.name : isCC ? cube.slice(CC_PREFIX.length) : cube

  function switchTo(next) {
    const parts = location.pathname.split("/").filter(Boolean)
    parts[0] = next
    navigate("/" + parts.join("/"))
  }

  function openCC(e) {
    e.preventDefault()
    const id = ccInput.trim()
    if (id === "") return
    setCcInput("")
    navigate("/" + CC_PREFIX + id)
  }

  async function refresh() {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const r = await fetch(`/api/${cube}/refresh`, { method: "POST" })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setRefreshMsg(`Updated: ${data.cards} cards`)
    } catch (err) {
      setRefreshMsg(`Refresh failed: ${String(err)}`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Menu position={collapsed ? "right-start" : "bottom-start"} width={240} withinPortal>
      <Menu.Target>
        <UnstyledButton className="se-switcher" aria-label="Switch cube">
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
        <form onSubmit={openCC} className="se-cc-form">
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="CubeCobra ID"
              value={ccInput}
              onChange={e => setCcInput(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button size="xs" type="submit">Open</Button>
          </Group>
        </form>
        {meta && meta.cubecobra_id && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconRefresh size={16} stroke={1.5} />}
              onClick={refresh}
              disabled={refreshing}
              closeMenuOnClick={false}
            >
              {refreshing ? "Refreshing…" : "Refresh from CubeCobra"}
            </Menu.Item>
            {refreshMsg && <Text size="xs" c="dimmed" px="sm" pb={6}>{refreshMsg}</Text>}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
