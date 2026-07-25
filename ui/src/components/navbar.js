import React, { useEffect, useState } from 'react';
import "./navbar.css"
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./Dropdown.js";
import { isReadOnly } from "../utils/readonly.js";

function CubeDropdown() {
  const [cubes, setCubes] = useState([]);
  const [ccInput, setCcInput] = useState("");
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

  function loadCC(e) {
    e.preventDefault();
    const id = ccInput.trim();
    if (id === "") return;
    setCcInput("");
    navigate('/cc:' + id);
  }

  // A cc: cube isn't in /api/cubes; show it as its own selected option so the
  // select doesn't blank out.
  const isCC = cube.startsWith("cc:");

  return (
    <div className="cube-picker">
      <select className="cube-select" value={cube} onChange={onChange}>
        {isCC && <option value={cube}>{"CubeCobra: " + cube.slice(3)}</option>}
        {cubes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <form className="cc-load" onSubmit={loadCC}>
        <input
          className="cc-load-input"
          type="text"
          placeholder="CubeCobra ID"
          value={ccInput}
          onChange={e => setCcInput(e.target.value)}
        />
        <Button text="Load" onClick={loadCC} />
      </form>
    </div>
  );
}

// Sections group the views by task: Browse looks up a specific record,
// Analyze reads aggregate performance, Design tunes the cube. A view's path
// is its segment after the cube id ("" is the Overview index). Reorder freely;
// the nav and sub-nav render straight from this.
const SECTIONS = [
  { label: "Overview", views: [{ label: "Overview", path: "" }] },
  { label: "Browse", views: [
    { label: "Decklists", path: "decklists" },
    { label: "Drafts", path: "drafts" },
    { label: "Players", path: "players" },
  ]},
  { label: "Analyze", views: [
    { label: "Cards", path: "cards" },
    { label: "Colors", path: "colors" },
    { label: "Explore", path: "explore" },
    { label: "Removal", path: "removal" },
    { label: "Archetypes", path: "types" },
    { label: "Decks", path: "deckstats" },
    { label: "Packages", path: "packages" },
  ]},
  { label: "Design", views: [
    { label: "Synergy", path: "synergy" },
    { label: "Map", path: "designmap" },
    { label: "Editor", path: "design-editor" },
    { label: "Health", path: "health" },
  ]},
];

const Navbar = () => {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const cube = parts[0] || null;
  if (!cube) return null;

  const readOnly = isReadOnly(cube);

  // The segment after the cube id picks the active view; "" is Overview.
  const view = parts[1] || "";
  const activeSection = SECTIONS.find(s => s.views.some(v => v.path === view));
  const activeViews = activeSection
    ? activeSection.views.filter(v => !(readOnly && v.path === "design-editor"))
    : [];

  function viewTo(path) {
    return path ? `/${cube}/${path}` : `/${cube}`;
  }

  return (
    <>
      <header className="header">
        <div className="mid">
          <ul className="navbar">
            {SECTIONS.map(s => (
              <li key={s.label}>
                <NavLink
                  end={s.views[0].path === ""}
                  to={viewTo(s.views[0].path)}
                  className={() => s === activeSection ? "active" : ""}
                >
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="nav-right">
            {!readOnly && (
              <NavLink
                to={`/${cube}/import`}
                className={({ isActive }) => "import-btn" + (isActive ? " active" : "")}
              >
                Import
              </NavLink>
            )}
            <CubeDropdown />
          </div>
        </div>
      </header>

      {activeSection && activeViews.length > 1 && (
        <div className="subheader">
          <div className="mid">
            <ul className="subnav">
              {activeViews.map(v => (
                <li key={v.path}>
                  <NavLink
                    end={v.path === ""}
                    to={viewTo(v.path)}
                    className={() => v.path === view ? "active" : ""}
                  >
                    {v.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
export default Navbar;
