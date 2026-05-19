import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  const [cubes, setCubes] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/cubes')
      .then(r => r.json())
      .then(data => setCubes(data.cubes || []))
      .catch(err => setError(String(err)));
  }, []);

  if (error) return <div>Failed to load cubes: {error}</div>;

  return (
    <div className="landing">
      <h1>Choose a cube</h1>
      <ul>
        {cubes.map(c => (
          <li key={c.id}>
            <Link to={`/${c.id}`}>
              <strong>{c.name}</strong>
              {c.description ? <> — {c.description}</> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
