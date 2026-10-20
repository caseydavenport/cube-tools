import { test } from "node:test"
import assert from "node:assert/strict"
import { fetchJSON } from "./fetchJSON.js"

// fakeFetch answers every request with the given response.
function fakeFetch(response) {
  return async () => response
}

test("resolves the parsed body", async () => {
  const body = await fetchJSON("/api/x", fakeFetch({ ok: true, status: 200, json: async () => ({ a: 1 }) }))
  assert.deepEqual(body, { a: 1 })
})

test("rejects a non-OK response", async () => {
  await assert.rejects(
    fetchJSON("/api/x", fakeFetch({ ok: false, status: 500, json: async () => ({}) })),
    err => err.message.includes("500") && err.message.includes("/api/x"),
  )
})

test("rejects a body that isn't JSON", async () => {
  const notJSON = { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <") } }
  await assert.rejects(fetchJSON("/api/x", fakeFetch(notJSON)), SyntaxError)
})
