import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCube } from '../contexts/CubeContext.js';

export default function Overview() {
  const cube = useCube();
  const [cubeMeta, setCubeMeta] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState(null);

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
    fetch(`data/${cube}/index.json`)
      .then(r => r.json())
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
