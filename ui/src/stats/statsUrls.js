// Building the URLs of the server's stats endpoints.

// statsUrl returns /api/<cube>/stats/<endpoint>?<params>, with the params in
// the order given and encoded for a URL. A param whose value is undefined is
// left out.
export function statsUrl(cube, endpoint, params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.append(key, String(value))
    }
  }
  return `/api/${cube}/stats/${endpoint}?${query.toString()}`
}
