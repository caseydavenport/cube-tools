import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCube } from '../contexts/CubeContext.js';

export default function Overview() {
  const cube = useCube();
  const [cubeMeta, setCubeMeta] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);

  async function refreshFromCubeCobra() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const r = await fetch(`/api/${cube}/refresh`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setRefreshMsg(`Updated from CubeCobra: ${data.cards} cards.`);
    } catch (err) {
      setRefreshMsg(`Refresh failed: ${String(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetch('/api/cubes')
      .then(r => r.json())
      .then(data => {
        const found = (data.cubes || []).find(c => c.id === cube);
        setCubeMeta(found || { id: cube, name: cube });
      })
      .catch(err => setError(String(err)));
  }, [cube]);

  useEffect(() => {
    fetch(`/api/${cube}/index`)
      .then(r => {
        // A cube with no generated data yet has no index.json; treat that as
        // an empty cube rather than surfacing the 404 body as a parse error.
        if (r.status === 404) return { drafts: [] };
        if (!r.ok) throw new Error(`index fetch failed: ${r.status}`);
        return r.json();
      })
      .then(data => setDrafts(data.drafts || []))
      .catch(err => setError(String(err)));
  }, [cube]);

  if (error) return <div className="overview">Error: {error}</div>;
  if (drafts === null) return null;

  const recentDrafts = [...drafts].reverse().slice(0, 10);
  const numDrafts = drafts.length;
  const numDecks = drafts.reduce((sum, d) => sum + (d.decks ? d.decks.length : 0), 0);

  return (
    <div className="overview landing">
      <h1>{cubeMeta ? cubeMeta.name : cube}</h1>
      <p className="overview-summary">
        {numDrafts} draft{numDrafts !== 1 ? 's' : ''}
        {numDecks > 0 ? `, ${numDecks} deck${numDecks !== 1 ? 's' : ''}` : ''}
      </p>

      {cubeMeta && cubeMeta.cubecobra_id && (
        <p className="overview-refresh">
          <button onClick={refreshFromCubeCobra} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh from CubeCobra'}
          </button>
          {refreshMsg ? <span className="overview-refresh-msg"> {refreshMsg}</span> : null}
        </p>
      )}

      {recentDrafts.length > 0 && (
        <div className="overview-recent">
          <h2>Recent drafts</h2>
          <ul>
            {recentDrafts.map((d, i) => (
              <li key={i}>
                <Link to={`/${cube}/drafts`}>{d.date}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
