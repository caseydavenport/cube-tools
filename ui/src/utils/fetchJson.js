// fetchJson fetches a URL and returns its parsed JSON. Unlike a bare fetch, it
// fails on an error status (like 404 or 500), so callers can show an error
// instead of treating the error page's body as data.
export async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json()
}
