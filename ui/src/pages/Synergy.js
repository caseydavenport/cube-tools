import React, { useRef, useEffect, useCallback } from 'react'
import { SortFunc } from "../utils/Utils.js"
import { NumericInput, Checkbox } from "../components/Dropdown.js"
import { White, Blue, Black, Red, Green } from "../utils/Colors.js"
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

export function SynergyWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <div className="synergy-container" style={{"padding": "1rem"}}>
      <SynergyWidgetOptions {...input} />
      <SynergyNetworkGraph
        synergyData={input.synergyData}
        cube={input.cube}
        onCardSelected={input.onCardSelected}
      />
      <div className="synergy-grid" style={{"marginTop": "1rem", "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "2rem"}}>
        <SynergyWidgetTable {...input} />
        <FocalPointsTable {...input} />
      </div>
    </div>
  );
}

function OptionTooltip({ id, header, tip, children }) {
  return (
    <OverlayTrigger placement="bottom" delay={{ show: 100, hide: 100 }} overlay={
      <Popover id={id}><Popover.Header as="h3">{header}</Popover.Header><Popover.Body>{tip}</Popover.Body></Popover>
    }>
      <div>{children}</div>
    </OverlayTrigger>
  );
}

function SynergyWidgetOptions(input) {
  let pairs = input.synergyData.pairs || []
  return (
    <div className="scroll-container-large-header" style={{"width": "100%", "margin": "0"}}>
      <div className="selector-group">
        <div className="selection-cell">
          Showing top {pairs.length} synergistic pairs
        </div>
        <OptionTooltip id="tip-min-decks" header="Min Decks" tip="Minimum co-occurrences to include a pair.">
          <NumericInput
            label="Min decks"
            value={input.minSynergyDecks}
            onChange={input.onMinSynergyDecksChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-focal" header="Focal Threshold" tip="Min synergy score for a partner to count toward focal score.">
          <NumericInput
            label="Focal threshold"
            value={input.focalThreshold}
            onChange={input.onFocalThresholdChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-smoothing" header="Smoothing K" tip="Dampens noisy scores from low-sample pairs. Higher K = more conservative. 0 = no smoothing.">
          <NumericInput
            label="Smoothing K"
            value={input.smoothingK}
            onChange={input.onSmoothingKChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-color-adjust" header="Color Adjust" tip="Adjust expected co-occurrence for color bias. When on, same-color pairs are compared against decks that could cast both cards, preventing inflated scores.">
          <Checkbox
            text="Color adjust"
            checked={input.colorAdjust}
            onChange={input.onColorAdjustChanged}
          />
        </OptionTooltip>
      </div>
    </div>
  );
}

function sortValue(sortBy, pair) {
  switch (sortBy) {
    case "card1": return pair.card1
    case "card2": return pair.card2
    case "count": return pair.count
    case "synergy": return pair.synergy_score
    case "winpercent": return pair.win_percent
    default: return pair.synergy_score
  }
}

function SynergyWidgetTable(input) {
  let pairs = input.synergyData.pairs || []
  let headers = [
    { id: "card1", text: "Card 1", tip: "First card in pair." },
    { id: "card2", text: "Card 2", tip: "Second card in pair." },
    { id: "winpercent", text: "Win %", tip: "Aggregate win % of decks with both." },
    { id: "count", text: "#", tip: "Number of decks." },
    { id: "synergy", text: "Syn", tip: "Lift score. >1 = appears together more than expected." },
  ]

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr><td colSpan="5" className="header-cell" style={{"textAlign": "center", "fontWeight": "bold", "background": "var(--primary)", "color": "var(--page-background)"}}>Synergistic Pairs</td></tr>
          <tr>
          {headers.map((hdr, i) => (
            <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }} overlay={<Popover id="popover-basic"><Popover.Header as="h3">{hdr.text}</Popover.Header><Popover.Body>{hdr.tip}</Popover.Body></Popover>}>
              <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
            </OverlayTrigger>
          ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, i) => (
            <tr className="widget-table-row" sort={sortValue(input.sortBy, pair)} key={i}>
              <td id={pair.card1} onClick={input.onCardSelected}>{pair.card1}</td>
              <td id={pair.card2} onClick={input.onCardSelected}>{pair.card2}</td>
              <td>{pair.win_percent.toFixed(0)}%</td>
              <td>{pair.count}</td>
              <td>{pair.synergy_score.toFixed(2)}x</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}

function FocalPointsTable(input) {
  let stats = input.synergyData.focal_stats || []
  let headers = [
    { id: "card_name", text: "Card", tip: "Card Name" },
    { id: "focal_score", text: "Score", tip: "Sum of synergy scores for partners above the focal threshold. High = build-around card." },
    { id: "partners", text: "Top Partners", tip: "Cards that most frequently appear with this card." },
  ]

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr><td colSpan="3" className="header-cell" style={{"textAlign": "center", "fontWeight": "bold", "background": "var(--primary)", "color": "var(--page-background)"}}>Archetype Focal Points</td></tr>
          <tr>
            {headers.map((hdr, i) => (
              <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }} overlay={<Popover id="popover-basic"><Popover.Header as="h3">{hdr.text}</Popover.Header><Popover.Body>{hdr.tip}</Popover.Body></Popover>}>
                <td className="header-cell">{hdr.text}</td>
              </OverlayTrigger>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((stat, i) => (
            <tr className="widget-table-row" sort={stat.focal_score} key={i}>
              <td onClick={input.onCardSelected} id={stat.card_name}>{stat.card_name}</td>
              <td>{stat.focal_score.toFixed(2)}</td>
              <td style={{"fontSize": "0.85em", "color": "var(--text-muted)"}}>{stat.top_partners.join(", ")}</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}

function SynergyNetworkGraph({ synergyData, cube, onCardSelected }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const nodeIndexRef = useRef({});
  const animRef = useRef(null);
  const dragRef = useRef(null);
  const hoveredRef = useRef(null);
  const drawRef = useRef(null);

  // Build a color lookup from cube cards.
  const cardColorMap = useCallback(() => {
    const map = {};
    if (cube && cube.cards) {
      for (const card of cube.cards) {
        map[card.name] = card.colors || [];
      }
    }
    return map;
  }, [cube]);

  // Get a display color for a card based on its MTG colors.
  function getNodeColor(colors) {
    if (!colors || colors.length === 0) return "#aaa"; // colorless
    if (colors.length > 1) return "#daa520"; // multicolor gold
    switch (colors[0]) {
      case "W": return White;
      case "U": return Blue;
      case "B": return Black;
      case "R": return Red;
      case "G": return Green;
      default: return "#aaa";
    }
  }

  useEffect(() => {
    const pairs = synergyData?.pairs || [];
    const focalStats = synergyData?.focal_stats || [];
    if (pairs.length === 0 || focalStats.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const colorMap = cardColorMap();

    // Build nodes from focal stats (limit to top 60 for performance).
    const topCards = focalStats.slice(0, 60);
    const cardSet = new Set(topCards.map(s => s.card_name));
    const nodes = topCards.map((stat, i) => {
      const angle = (2 * Math.PI * i) / topCards.length;
      const radius = Math.min(width, height) * 0.35;
      return {
        id: stat.card_name,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: Math.max(4, Math.min(14, 3 + stat.focal_score * 0.5)),
        color: getNodeColor(colorMap[stat.card_name]),
        focalScore: stat.focal_score,
      };
    });

    // Build edges from pairs where both cards are in our node set.
    const edges = [];
    for (const pair of pairs) {
      if (cardSet.has(pair.card1) && cardSet.has(pair.card2)) {
        edges.push({
          source: pair.card1,
          target: pair.card2,
          weight: pair.synergy_score,
        });
      }
    }

    // Create node index for fast lookup.
    const nodeIndex = {};
    for (let i = 0; i < nodes.length; i++) {
      nodeIndex[nodes[i].id] = i;
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    nodeIndexRef.current = nodeIndex;

    let frame = 0;
    const maxFrames = 250;
    const damping = 0.92;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const hovered = hoveredRef.current;

      // Draw edges.
      for (const edge of edges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const s = nodes[si];
        const t = nodes[ti];
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.4, edge.weight * 0.05)})`;
        ctx.lineWidth = Math.max(0.5, Math.min(3, edge.weight * 0.3));
        ctx.stroke();
      }

      // Draw nodes.
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = hovered === node.id ? "#fff" : "rgba(0,0,0,0.5)";
        ctx.lineWidth = hovered === node.id ? 2 : 1;
        ctx.stroke();
      }

      // Draw hovered node label.
      if (hovered) {
        const node = nodes.find(n => n.id === hovered);
        if (node) {
          ctx.font = "13px monospace";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(node.id, node.x, node.y - node.radius - 6);
        }
      }
    }

    // Store draw function in ref so mouse handlers can trigger redraws.
    drawRef.current = draw;

    function simulate() {
      if (frame > maxFrames) {
        draw();
        return;
      }
      frame++;

      const alpha = 1 - frame / maxFrames;

      // Repulsion (Coulomb) between all node pairs.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Cap minimum distance so overlapping nodes don't explode.
          if (dist < 20) dist = 20;
          let force = (2000 * alpha) / (dist * dist);
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction (Hooke) along edges.
      for (const edge of edges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const s = nodes[si];
        const t = nodes[ti];
        let dx = t.x - s.x;
        let dy = t.y - s.y;
        let strength = 0.015 * Math.min(edge.weight, 5) * alpha;
        let fx = dx * strength;
        let fy = dy * strength;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center gravity — decays with alpha so it stays balanced with repulsion.
      for (const node of nodes) {
        node.vx += (width / 2 - node.x) * 0.008 * alpha;
        node.vy += (height / 2 - node.y) * 0.008 * alpha;
      }

      // Apply velocities.
      const pad = 30;
      for (const node of nodes) {
        if (dragRef.current && dragRef.current.id === node.id) continue;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(node.radius + pad, Math.min(width - node.radius - pad, node.x));
        node.y = Math.max(node.radius + pad, Math.min(height - node.radius - pad, node.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    }

    animRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      drawRef.current = null;
    };
  }, [synergyData, cube, cardColorMap]);

  // Mouse interaction handlers.
  function getNodeAt(x, y) {
    for (const node of nodesRef.current) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
        return node;
      }
    }
    return null;
  }

  function handleMouseMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragRef.current) {
      dragRef.current.x = x;
      dragRef.current.y = y;
      dragRef.current.vx = 0;
      dragRef.current.vy = 0;
      if (drawRef.current) drawRef.current();
      return;
    }

    const node = getNodeAt(x, y);
    const newHovered = node ? node.id : null;
    if (newHovered !== hoveredRef.current) {
      hoveredRef.current = newHovered;
      if (drawRef.current) drawRef.current();
    }
    canvas.style.cursor = node ? "pointer" : "default";
  }

  function handleMouseDown(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = getNodeAt(x, y);
    if (node) {
      dragRef.current = node;
    }
  }

  function handleMouseUp(e) {
    if (dragRef.current) {
      const canvas = canvasRef.current;
      if (canvas && onCardSelected) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const node = getNodeAt(x, y);
        if (node && node.id === dragRef.current.id) {
          onCardSelected({ currentTarget: { id: node.id } });
        }
      }
      dragRef.current = null;
      if (drawRef.current) drawRef.current();
    }
  }

  function handleMouseLeave() {
    dragRef.current = null;
    if (hoveredRef.current) {
      hoveredRef.current = null;
      if (drawRef.current) drawRef.current();
    }
  }

  const pairs = synergyData?.pairs || [];
  const focalStats = synergyData?.focal_stats || [];
  if (pairs.length === 0 || focalStats.length === 0) {
    return null;
  }

  return (
    <div style={{marginTop: "1rem", textAlign: "center"}}>
      <h4 style={{color: "var(--primary)", marginBottom: "0.5rem"}}>Synergy Network Graph</h4>
      <p style={{color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "0.5rem"}}>
        Node size = focal score. Color = card color identity. Hover for name, click to select, drag to reposition.
      </p>
      <canvas
        ref={canvasRef}
        width={900}
        height={600}
        style={{
          border: "1px solid var(--card-background)",
          borderRadius: "8px",
          background: "var(--page-background)",
          maxWidth: "100%",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
