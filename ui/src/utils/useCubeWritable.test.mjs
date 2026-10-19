import { test } from "node:test"
import assert from "node:assert/strict"
import { fetchCubeInfo } from "./useCubeWritable.js"

// stubFetch answers /info requests from the given list of responses in order.
function stubFetch(responses) {
  const calls = []
  globalThis.fetch = url => {
    calls.push(url)
    const r = responses.shift()
    if (r instanceof Error) return Promise.reject(r)
    return Promise.resolve({ ok: r.ok, json: () => Promise.resolve(r.body) })
  }
  return calls
}

test("a failed info fetch is retried by the next caller", async () => {
  const calls = stubFetch([new Error("network down"), { ok: true, body: { writable: true, decks: true } }])
  assert.equal(await fetchCubeInfo("journey"), undefined)
  assert.deepEqual(await fetchCubeInfo("journey"), { writable: true, decks: true })
  assert.equal(calls.length, 2)
})

test("a server error is retried by the next caller", async () => {
  const calls = stubFetch([{ ok: false }, { ok: true, body: { writable: true } }])
  assert.equal(await fetchCubeInfo("heart"), undefined)
  assert.deepEqual(await fetchCubeInfo("heart"), { writable: true })
  assert.equal(calls.length, 2)
})

test("a successful answer is fetched once", async () => {
  const calls = stubFetch([{ ok: true, body: { writable: false } }])
  assert.deepEqual(await fetchCubeInfo("cc:kiss"), { writable: false })
  assert.deepEqual(await fetchCubeInfo("cc:kiss"), { writable: false })
  assert.equal(calls.length, 1)
})

test("each cube's info is cached separately", async () => {
  const calls = stubFetch([
    { ok: true, body: { writable: true, decks: true } },
    { ok: true, body: { writable: false, decks: false } },
  ])
  assert.deepEqual(await fetchCubeInfo("ozzy"), { writable: true, decks: true })
  assert.deepEqual(await fetchCubeInfo("cc:joan"), { writable: false, decks: false })
  assert.deepEqual(await fetchCubeInfo("ozzy"), { writable: true, decks: true })
  assert.equal(calls.length, 2)
})
