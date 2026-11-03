// The link check: pick two cards and see whether the rules link them, how,
// and the ways to change that. It lives under the Rules editor's URL, so the
// deck map and card page can link straight to a pair.

import React, { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useCube } from "../../contexts/CubeContext.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { PageToolbar } from "../../toolbar/PageToolbar.js"
import { AnyCardSearch } from "../../cards/AnyCardSearch.js"
import { CardLink } from "../../components/CardLink.js"
import { CardImageURL } from "../../utils/Utils.js"
import { linkCheckUrl } from "../../stats/pageRequests.js"
import { GroupEditModal } from "../map/GroupEditModal.js"
import { saveDesignMap } from "../map/designData.js"
import { ruleColor } from "../map/ruleColors.js"
import { cleanGroup } from "../rules/rulebookEdits.js"
import { applyExclude } from "./linkCheckModel.js"
import { LinkedView } from "./LinkedView.js"
import { UnlinkedView } from "./UnlinkedView.js"
import "./linkCheck.css"

// useRules loads the saved rule set. reload is bumped after each save.
function useRules(cube, reload) {
  const [rules, setRules] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/${cube}/stats/design-graph`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          setRules({ groups: d.groups || [], packages: d.packages || [] })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRules({ groups: [], packages: [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [cube, reload])
  return rules
}

// useLinkCheck loads the check for cards a and b. It returns { check,
// missing }: check is null while loading, and missing is true when the
// server doesn't know a card.
function useLinkCheck(cube, a, b, reload) {
  const [state, setState] = useState({ check: null, missing: false })
  useEffect(() => {
    setState({ check: null, missing: false })
    if (!a || !b) {
      return
    }
    let cancelled = false
    fetch(linkCheckUrl(cube, a, b))
      .then(r => {
        if (r.status === 404) {
          return { missing: true }
        }
        return r.json()
      })
      .then(body => {
        if (cancelled) {
          return
        }
        if (body.missing) {
          setState({ check: null, missing: true })
        } else {
          setState({ check: body, missing: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ check: null, missing: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [cube, a, b, reload])
  return state
}

// CardSide is one card's image and name, linking to its card page.
function CardSide({ name, cube }) {
  return (
    <div className="link-card">
      <img className="kit-card-image" src={CardImageURL({ name })} alt={name} />
      <CardLink cube={cube} name={name} />
    </div>
  )
}

// LinkCheckPage is the link check for the cards in the URL's "a" and "b".
export function LinkCheckPage(props) {
  const cube = useCube()
  const [params, setParams] = useSearchParams()
  const a = params.get("a") || ""
  const b = params.get("b") || ""
  const [reload, setReload] = useState(0)
  const [status, setStatus] = useState("")
  const [newGroupFor, setNewGroupFor] = useState("")
  const rules = useRules(cube, reload)
  const { check, missing } = useLinkCheck(cube, a, b, reload)

  // The Rules editor colors packages by their place in name order.
  const packageIndex = useMemo(() => {
    const index = {}
    for (const [i, p] of (rules?.packages || []).entries()) {
      index[p.name] = i
    }
    return index
  }, [rules])

  // setCard writes one picked card to the URL.
  function setCard(key, name) {
    const next = new URLSearchParams(params)
    if (name) {
      next.set(key, name)
    } else {
      next.delete(key)
    }
    setParams(next, { replace: true })
  }

  // save writes a changed rule set and reloads the check.
  function save(next) {
    saveDesignMap(cube, next.groups, next.packages, () => setReload(r => r + 1), setStatus)
  }

  // saveNewGroup adds the group from the editor and closes it.
  function saveNewGroup(group) {
    const entry = cleanGroup(group)
    if (!entry) {
      setStatus("A group needs at least one condition.")
      return
    }
    save({ groups: [...rules.groups, entry], packages: rules.packages })
    setNewGroupFor("")
  }

  // exclude drops a card from a group.
  function exclude(group, card) {
    save(applyExclude(rules, group, card))
  }

  const toolbar = (
    <PageToolbar title="Link check">
      <AnyCardSearch cube={cube} value={a} onPick={name => setCard("a", name)} placeholder="First card" className="link-picker" />
      <span className="link-times">×</span>
      <AnyCardSearch cube={cube} value={b} onPick={name => setCard("b", name)} placeholder="Second card" className="link-picker" />
    </PageToolbar>
  )

  let middle = <div className="browse-empty">Pick two cards.</div>
  if (a && b && missing) {
    middle = <div className="browse-empty">One of these isn't a card the app knows.</div>
  } else if (a && b && (!check || !rules)) {
    middle = <div className="browse-empty">Loading…</div>
  } else if (check && check.links.length > 0) {
    const nav = { start: props.startDate, end: props.endDate, onLinkMatch: props.onLinkMatch }
    middle = <LinkedView check={check} cube={cube} packageIndex={packageIndex} onExclude={exclude} nav={nav} />
  } else if (check) {
    middle = <UnlinkedView check={check} cube={cube} rules={rules} range={{ start: props.startDate || "", end: props.endDate || "" }} onSave={save} onNewGroup={setNewGroupFor} />
  }

  return (
    <>
      {toolbar}
      <div className="card-page">
        <SectionCard title="Link check">
          <div className="link-grid">
            {a ? <CardSide name={a} cube={cube} /> : <div />}
            {middle}
            {b ? <CardSide name={b} cube={cube} /> : <div />}
          </div>
          {status && <div className="link-status" role="status">{status}</div>}
        </SectionCard>
      </div>
      {newGroupFor && (
        <GroupEditModal
          group={{ name: "", conditions: [""] }}
          color={ruleColor(rules.groups.length)}
          pinnedCard={newGroupFor}
          rules={rules}
          range={{ start: props.startDate || "", end: props.endDate || "" }}
          onSave={saveNewGroup}
          onCancel={() => setNewGroupFor("")}
        />
      )}
    </>
  )
}
