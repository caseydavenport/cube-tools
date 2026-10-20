import { test } from "node:test"
import assert from "node:assert/strict"
import { fetchJson } from "./fetchJson.js"

// stubFetch answers every request with one response.
function stubFetch(response) {
  globalThis.fetch = () => Promise.resolve(response)
}

test("fetchJson returns the parsed body of a successful response", async () => {
  stubFetch({ ok: true, json: () => Promise.resolve({ cubes: [] }) })
  assert.deepEqual(await fetchJson("/api/cubes"), { cubes: [] })
})

test("fetchJson rejects a failed response with its status", async () => {
  stubFetch({ ok: false, status: 500, statusText: "Internal Server Error", json: () => Promise.resolve({}) })
  await assert.rejects(fetchJson("/api/cubes"), /500 Internal Server Error/)
})

test("fetchJson rejects a body that isn't JSON", async () => {
  stubFetch({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected token <")) })
  await assert.rejects(fetchJson("/api/cubes"), SyntaxError)
})
