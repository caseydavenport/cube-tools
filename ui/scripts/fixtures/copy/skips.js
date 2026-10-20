const COPY = { title: "Charts" }

export function Charts({ cube }) {
  fetch(`/api/${cube}/stats/pivot`)
  return <div className="widget-table-row" style={{ padding: "4px 8px" }}>{COPY.title}</div>
}
