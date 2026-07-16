import React from 'react'
import { DropdownHeader, NumericInput } from "./Dropdown.js"

// PREDICATE_DIMS are the deck attributes a filter can test. `kind` drives which
// operators and value control render for the row.
const PREDICATE_DIMS = [
  { value: "color", label: "Color", kind: "color" },
  { value: "archetype", label: "Archetype", kind: "choice", metaKey: "archetypes" },
  { value: "label", label: "Label", kind: "choice", metaKey: "labels" },
  { value: "player", label: "Player", kind: "choice", metaKey: "players" },
  { value: "removal", label: "Removal count", kind: "numeric" },
  { value: "interaction", label: "Interaction count", kind: "numeric" },
  { value: "counterspell", label: "Counterspell count", kind: "numeric" },
  { value: "creatures", label: "Creature count", kind: "numeric" },
  { value: "lands", label: "Land count", kind: "numeric" },
  { value: "avg_cmc", label: "Avg mana value", kind: "numeric" },
  { value: "dna", label: "DNA count", kind: "numeric" },
  { value: "card_query", label: "Card query", kind: "query" },
]

const OPS_BY_KIND = {
  color: [{ value: "contains", label: "contains" }, { value: "excludes", label: "excludes" }],
  choice: [{ value: "eq", label: "is" }, { value: "neq", label: "is not" }],
  numeric: [{ value: "gte", label: "≥" }, { value: "lte", label: "≤" }, { value: "eq", label: "=" }],
  query: [{ value: "match", label: "matches" }, { value: "excludes", label: "excludes" }],
}

function dimMeta(dim) {
  return PREDICATE_DIMS.find(d => d.value === dim) || PREDICATE_DIMS[0]
}

// defaultPredicate returns a fresh predicate for the given dim with a sensible
// default operator, so switching dims never leaves an op that doesn't apply.
function defaultPredicate(dim) {
  const kind = dimMeta(dim).kind
  return { dim, op: OPS_BY_KIND[kind][0].value, value: "" }
}

// PredicateBuilder edits a list of {dim, op, value} filters. The whole list is
// held by the parent; every change emits a fresh array via onChange. meta
// supplies known values for choice dims ({archetypes, players, labels}).
export function PredicateBuilder({ predicates, onChange, meta }) {
  function update(i, next) {
    const copy = predicates.slice()
    copy[i] = next
    onChange(copy)
  }
  function remove(i) {
    onChange(predicates.filter((_, j) => j !== i))
  }
  function add() {
    onChange([...predicates, defaultPredicate("color")])
  }

  return (
    <div className="predicate-builder">
      {predicates.map((p, i) => {
        const dm = dimMeta(p.dim)
        const ops = OPS_BY_KIND[dm.kind]
        return (
          <div className="predicate-row" key={i}>
            <DropdownHeader
              label=""
              value={p.dim}
              options={PREDICATE_DIMS}
              onChange={(e) => update(i, defaultPredicate(e.target.value))}
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
              onChange={(v) => update(i, { ...p, value: v })}
            />
            <button className="predicate-remove" onClick={() => remove(i)} title="Remove filter">✕</button>
          </div>
        )
      })}
      <button className="button predicate-add" onClick={add}>+ Add filter</button>
    </div>
  )
}

function ValueControl({ dm, value, meta, onChange }) {
  if (dm.kind === "numeric") {
    return <NumericInput label="" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (dm.kind === "choice") {
    const known = (meta && meta[dm.metaKey]) || []
    const options = [{ value: "", label: "—" }, ...known.map(v => ({ value: v, label: v }))]
    return <DropdownHeader label="" value={value} options={options} onChange={(e) => onChange(e.target.value)} />
  }
  // color letters (WUBRG) or a card query string.
  const placeholder = dm.kind === "color" ? "WUBRG" : "e.g. o:flying t:creature"
  return (
    <div className="dropdown">
      <input
        className="text-input"
        style={dm.kind === "query" ? { minWidth: "180px" } : { width: "80px" }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
