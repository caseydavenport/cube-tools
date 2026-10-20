import React from 'react'
import { ActionIcon, Button, TextInput } from "@mantine/core"
import { IconPlus, IconX } from "@tabler/icons-react"
import { DropdownHeader, NumericInput } from "./Dropdown.js"

// predicateDims returns the deck attributes a filter can test, labeled from
// `copy`. `kind` drives which operators and value control render for the row.
function predicateDims(copy) {
  return [
    { value: "color", label: copy.dims.color, kind: "color" },
    { value: "archetype", label: copy.dims.archetype, kind: "choice", metaKey: "archetypes" },
    { value: "label", label: copy.dims.label, kind: "choice", metaKey: "labels" },
    { value: "player", label: copy.dims.player, kind: "choice", metaKey: "players" },
    { value: "removal", label: copy.dims.removal, kind: "numeric" },
    { value: "interaction", label: copy.dims.interaction, kind: "numeric" },
    { value: "counterspell", label: copy.dims.counterspell, kind: "numeric" },
    { value: "creatures", label: copy.dims.creatures, kind: "numeric" },
    { value: "lands", label: copy.dims.lands, kind: "numeric" },
    { value: "avg_cmc", label: copy.dims.avgCmc, kind: "numeric" },
    { value: "dna", label: copy.dims.dna, kind: "numeric" },
    { value: "card_query", label: copy.dims.cardQuery, kind: "query" },
  ]
}

// opsByKind returns the operators each kind of dimension offers, labeled from
// `copy`. The first one is the default for a new filter.
function opsByKind(copy) {
  return {
    color: [{ value: "contains", label: copy.ops.contains }, { value: "excludes", label: copy.ops.excludes }],
    choice: [{ value: "eq", label: copy.ops.is }, { value: "neq", label: copy.ops.isNot }],
    numeric: [{ value: "gte", label: copy.ops.atLeast }, { value: "lte", label: copy.ops.atMost }, { value: "eq", label: copy.ops.equals }],
    query: [{ value: "match", label: copy.ops.matches }, { value: "excludes", label: copy.ops.excludes }],
  }
}

function dimMeta(dim, copy) {
  const dims = predicateDims(copy)
  return dims.find(d => d.value === dim) || dims[0]
}

// defaultPredicate returns a fresh predicate for the given dim with a sensible
// default operator, so switching dims never leaves an op that doesn't apply.
function defaultPredicate(dim, copy) {
  const kind = dimMeta(dim, copy).kind
  return { dim, op: opsByKind(copy)[kind][0].value, value: "" }
}

// PredicateBuilder edits a list of {dim, op, value} filters. The whole list is
// held by the parent; every change emits a fresh array via onChange. meta
// supplies known values for choice dims ({archetypes, players, labels}); copy
// holds the text.
export function PredicateBuilder({ predicates, onChange, meta, copy }) {
  function update(i, next) {
    const updated = predicates.slice()
    updated[i] = next
    onChange(updated)
  }
  function remove(i) {
    onChange(predicates.filter((_, j) => j !== i))
  }
  function add() {
    onChange([...predicates, defaultPredicate("color", copy)])
  }

  return (
    <div className="predicate-builder">
      {predicates.map((p, i) => {
        const dm = dimMeta(p.dim, copy)
        const ops = opsByKind(copy)[dm.kind]
        return (
          <div className="predicate-row" key={i}>
            <DropdownHeader
              label=""
              value={p.dim}
              options={predicateDims(copy)}
              onChange={(e) => update(i, defaultPredicate(e.target.value, copy))}
            />
            <DropdownHeader
              label=""
              value={p.op}
              options={ops}
              onChange={(e) => update(i, { ...p, op: e.target.value })}
            />
            <ValueControl
              dm={dm}
              value={p.value}
              meta={meta}
              copy={copy}
              onChange={(v) => update(i, { ...p, value: v })}
            />
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={copy.removeFilter} onClick={() => remove(i)}>
              <IconX size={14} />
            </ActionIcon>
          </div>
        )
      })}
      <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} className="predicate-add" onClick={add}>
        {copy.addFilter}
      </Button>
    </div>
  )
}

function ValueControl({ dm, value, meta, copy, onChange }) {
  if (dm.kind === "numeric") {
    return <NumericInput label="" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (dm.kind === "choice") {
    const known = (meta && meta[dm.metaKey]) || []
    const options = [{ value: "", label: copy.noChoice }, ...known.map(v => ({ value: v, label: v }))]
    return <DropdownHeader label="" value={value} options={options} onChange={(e) => onChange(e.target.value)} />
  }
  // color letters (WUBRG) or a card query string.
  let placeholder = copy.queryPlaceholder
  let width = 180
  if (dm.kind === "color") {
    placeholder = copy.colorPlaceholder
    width = 80
  }

  return (
    <TextInput
      size="xs"
      w={width}
      value={value}
      placeholder={placeholder}
      aria-label={dm.label}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
