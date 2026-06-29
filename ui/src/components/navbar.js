import React, { useEffect, useState } from 'react';
import "./navbar.css"
import { NavLink, useLocation, useNavigate } from "react-router-dom";

function CubeDropdown() {
  const [cubes, setCubes] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();
  const cube = location.pathname.split('/').filter(Boolean)[0] || null;

  useEffect(() => {
    fetch('/api/cubes')
      .then(r => r.json())
      .then(data => setCubes(data.cubes || []))
      .catch(() => setCubes([]));
  }, []);

  if (!cube) return null;

  function onChange(e) {
    const next = e.target.value;
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      navigate('/' + next);
      return;
    }
    parts[0] = next;
    navigate('/' + parts.join('/'));
  }

  return (
    <select className="cube-select" value={cube} onChange={onChange}>
      {cubes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

const Navbar = () => {
  const location = useLocation();
  const cube = location.pathname.split('/').filter(Boolean)[0] || null;
  if (!cube) return null;
  return (
    <header className="header">
      <div className="mid">
        <ul className="navbar">
          <li><NavLink end to={`/${cube}`} className={({ isActive }) => isActive ? "active" : ""}>Overview</NavLink></li>
          <li><NavLink to={`/${cube}/cards`} className={({ isActive }) => isActive ? "active" : ""}>Cards</NavLink></li>
          <li><NavLink to={`/${cube}/colors`} className={({ isActive }) => isActive ? "active" : ""}>Colors</NavLink></li>
          <li><NavLink to={`/${cube}/types`} className={({ isActive }) => isActive ? "active" : ""}>Types</NavLink></li>
          <li><NavLink to={`/${cube}/decklists`} className={({ isActive }) => isActive ? "active" : ""}>Decklists</NavLink></li>
          <li><NavLink to={`/${cube}/import`} className={({ isActive }) => isActive ? "active" : ""}>Import</NavLink></li>
          <li><NavLink to={`/${cube}/deckstats`} className={({ isActive }) => isActive ? "active" : ""}>Deck Stats</NavLink></li>
          <li><NavLink to={`/${cube}/drafts`} className={({ isActive }) => isActive ? "active" : ""}>Drafts</NavLink></li>
          <li><NavLink to={`/${cube}/players`} className={({ isActive }) => isActive ? "active" : ""}>Players</NavLink></li>
          <li><NavLink to={`/${cube}/synergy`} className={({ isActive }) => isActive ? "active" : ""}>Synergy</NavLink></li>
          <li><NavLink to={`/${cube}/health`} className={({ isActive }) => isActive ? "active" : ""}>Health</NavLink></li>
          <li><NavLink to={`/${cube}/designmap`} className={({ isActive }) => isActive ? "active" : ""}>Design Map</NavLink></li>
        </ul>
        <CubeDropdown />
      </div>
    </header>
  );
}
export default Navbar;
