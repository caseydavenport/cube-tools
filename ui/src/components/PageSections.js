// Copyright (c) 2026 Tigera, Inc. All rights reserved.

import React from 'react';
import "./components.css";

// Section wraps a content block on an Analyze page with a consistent heading
// and an id that the in-page SectionNav can jump to.
export function Section({ id, heading, children }) {
  return (
    <section id={id} className="page-section">
      {heading && <h3 className="section-heading kit-section-title">{heading}</h3>}
      {children}
    </section>
  );
}

// TabNav renders the same strip as SectionNav, but as tabs: clicking one
// shows that tab's content instead of scrolling to it. tabs is an array of
// { id, label }; active is the shown tab's id and onChange gets the clicked id.
export function TabNav({ tabs, active, onChange }) {
  // pick switches tabs without following the link's href.
  function pick(e, id) {
    e.preventDefault()
    onChange(id)
  }

  return (
    <nav className="section-nav" role="tablist">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? "active" : ""}
          onClick={(e) => pick(e, tab.id)}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  )
}

// SectionNav renders the sticky in-page jump strip. It scroll-spies the active
// section via an IntersectionObserver and scrolls to a section on click.
// sections is an array of { id, label }; pass a stable reference so the
// observer isn't torn down every render.
export function SectionNav({ sections }) {
  const [active, setActive] = React.useState(sections[0] ? sections[0].id : null);

  React.useEffect(() => {
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (let e of entries) {
          if (e.isIntersecting) {
            visible.add(e.target.id);
          } else {
            visible.delete(e.target.id);
          }
        }
        // Highlight the topmost section currently in view (first in declared
        // order), so it stays correct even when several are visible at once.
        for (let s of sections) {
          if (visible.has(s.id)) {
            setActive(s.id);
            break;
          }
        }
      },
      // Trip the active section once it clears the sticky chrome at the top.
      { rootMargin: "-130px 0px -65% 0px" }
    );
    for (let s of sections) {
      let el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const jump = (e, id) => {
    e.preventDefault();
    let el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="section-nav">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={s.id === active ? "active" : ""}
          onClick={(e) => jump(e, s.id)}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
