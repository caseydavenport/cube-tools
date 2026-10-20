// fetchJSON fetches a URL and returns its parsed JSON body, failing loudly on
// anything else. Plain fetch only fails on a network error, so a 500 or a
// proxy's HTML error page would otherwise slip through.

// fetchJSON resolves with the parsed body. It rejects when the response's
// status isn't OK, or when the body isn't JSON. fetchFn is there so tests can
// pass a fake.
export async function fetchJSON(url, fetchFn = fetch) {
  const response = await fetchFn(url)
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`)
  }
  return response.json()
}
