import { test } from "node:test"
import assert from "node:assert/strict"
import { fetchWritable } from "./useCubeWritable.js"

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
  const calls = stubFetch([new Error("network down"), { ok: true, body: { writable: true } }])
  assert.equal(await fetchWritable("journey"), undefined)
  assert.equal(await fetchWritable("journey"), true)
  assert.equal(calls.length, 2)
})

test("a server error is retried by the next caller", async () => {
  const calls = stubFetch([{ ok: false }, { ok: true, body: { writable: true } }])
  assert.equal(await fetchWritable("heart"), undefined)
  assert.equal(await fetchWritable("heart"), true)
  assert.equal(calls.length, 2)
})

test("a successful answer is fetched once", async () => {
  const calls = stubFetch([{ ok: true, body: { writable: false } }])
  assert.equal(await fetchWritable("cc:kiss"), false)
  assert.equal(await fetchWritable("cc:kiss"), false)
  assert.equal(calls.length, 1)
})
