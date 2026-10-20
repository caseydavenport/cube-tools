// fetchJson fetches a URL and returns its parsed JSON. Unlike a bare fetch, it
// fails on an error status (like 404 or 500), so callers can show an error
// instead of treating the error page's body as data. options are passed to
// fetch as they are, such as the method and body of a POST.
export async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json()
}
