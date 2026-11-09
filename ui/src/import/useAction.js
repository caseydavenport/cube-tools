import { useState } from "react"

// useAction runs a page's async actions (a parse, an import, a commit) one at a
// time. It tracks whether one is running, so buttons can disable themselves,
// and the message of the last failure, so the page can show it. run(action)
// returns the action's result, or undefined when it failed or one was already
// running.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run(action) {
    if (busy) {
      return undefined
    }

    setBusy(true)
    setError("")
    try {
      return await action()
    } catch (e) {
      setError(errorText(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, setError, run }
}

// errorText turns a thrown value into a message to show.
export function errorText(e) {
  if (e && e.message) {
    return e.message
  }
  return String(e)
}
