// The Synergy network graph: cards as nodes, linked when they do better
// together.

import React, { useRef, useEffect, useCallback } from 'react'
import { useComputedColorScheme } from "@mantine/core"
import { currentChartTheme, seriesColor, withAlpha } from "../../theme/chartTheme.js"
import { cardDisplayColor, cardInColors, colorsFromMatch } from "./synergyHelpers.js"
import { ChartTitle } from "./synergyParts.js"

// nodeFill is a network node's color, read at draw time so it follows the
// scheme: its card's color identity for a hub, muted for a pulled-in partner.
function nodeFill(node) {
  if (!node.primary) {
    return currentChartTheme().muted;
  }
  return cardDisplayColor(node.colors);
}

// nodeOutline rings the hovered node in the text color and the rest faintly.
function nodeOutline(node, hovered) {
  if (hovered === node.id) {
    return currentChartTheme().text;
  }
  return withAlpha(currentChartTheme().text, 0.35);
}

export function SynergyNetworkGraph({ synergyData, cube, matchStr, onCardSelected }) {
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
        map[card.name] = card.colors;
      }
    }
    return map;
  }, [cube]);

  // Repaint with the new colors when the scheme changes. Only the drawing is
  // redone, so the nodes stay where the layout put them.
  const scheme = useComputedColorScheme("light");
  useEffect(() => {
    if (drawRef.current) {
      drawRef.current();
    }
  }, [scheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const colorMap = cardColorMap();

    // Narrow to the colors picked in the global filter. Both endpoints of a pair
    // have to match, so a color filter shows the within-color subgraph rather than
    // dragging in off-color partners.
    const colorSet = colorsFromMatch(matchStr);
    const focalStats = colorSet
      ? (synergyData?.focal_stats || []).filter(s => cardInColors(colorMap[s.card_name], colorSet))
      : (synergyData?.focal_stats || []);
    const pairs = colorSet
      ? (synergyData?.pairs || []).filter(p => cardInColors(colorMap[p.card1], colorSet) && cardInColors(colorMap[p.card2], colorSet))
      : (synergyData?.pairs || []);
    if (pairs.length === 0 || focalStats.length === 0) return;

    // Primary nodes are the top focal-score cards. Satellites are the cards they
    // synergize with that didn't themselves make the focal cut - we pull these onto
    // the graph (gray) so a high-focal card never floats unconnected, and so you can
    // see whether its partners are other hubs (flexible) or niche cards (parasitic).
    const focalByName = {};
    const peakByName = {};
    for (const s of focalStats) {
      focalByName[s.card_name] = s.focal_score;
      peakByName[s.card_name] = s.peak_synergy || 0;
    }

    const topCards = focalStats.slice(0, 60);
    const primarySet = new Set(topCards.map(s => s.card_name));

    const satelliteSet = new Set();
    for (const pair of pairs) {
      const aIn = primarySet.has(pair.card1);
      const bIn = primarySet.has(pair.card2);
      if (aIn && !bIn) satelliteSet.add(pair.card2);
      else if (bIn && !aIn) satelliteSet.add(pair.card1);
    }

    const nodeDefs = [
      ...topCards.map(s => ({ name: s.card_name, focal: s.focal_score, primary: true })),
      ...[...satelliteSet].map(name => ({ name, focal: focalByName[name] || 0, primary: false })),
    ];
    const cardSet = new Set(nodeDefs.map(d => d.name));

    const nodes = nodeDefs.map((def, i) => {
      const angle = (2 * Math.PI * i) / nodeDefs.length;
      const radius = Math.min(width, height) * 0.35;
      return {
        id: def.name,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        // Satellites get a small fixed dot; primaries scale with focal score.
        radius: def.primary ? Math.max(4, Math.min(14, 3 + def.focal * 0.5)) : 3.5,
        colors: colorMap[def.name],
        primary: def.primary,
        focalScore: def.focal,
        peak: peakByName[def.name] || 0,
        // Depth ring strength: peak 1.5 (the focal floor) is flat, 2.5+ is a full
        // ring. Lets a broad-but-shallow support node read apart from a real hub.
        depth: Math.max(0, Math.min(1, (peakByName[def.name] || 0) - 1.5)),
      };
    });

    // Build edges from pairs where both cards are in our node set. The endpoint
    // returns only above-chance pairs (lift > 1), so every edge is a synergy; we
    // normalize lift against the strongest edge so color/thickness scale to the
    // range on screen rather than to absolute scores.
    const edges = [];
    let maxDev = 0;
    for (const pair of pairs) {
      if (cardSet.has(pair.card1) && cardSet.has(pair.card2)) {
        const dev = pair.synergy_score - 1;
        if (dev > maxDev) maxDev = dev;
        edges.push({
          source: pair.card1,
          target: pair.card2,
          weight: pair.synergy_score,
          dev: dev,
        });
      }
    }
    // Normalized 0..1 strength per edge for rendering.
    for (const edge of edges) {
      edge.strength = maxDev > 0 ? Math.max(0, edge.dev) / maxDev : 0;
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

      // Draw edges. Stronger synergies are brighter and thicker, scaled
      // relative to the other edges on screen.
      for (const edge of edges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const s = nodes[si];
        const t = nodes[ti];
        const connected = hovered && (edge.source === hovered || edge.target === hovered);
        // Dim everything when hovering except edges touching the hovered node.
        const baseAlpha = 0.25 + 0.55 * edge.strength;
        const alpha = hovered ? (connected ? Math.min(1, baseAlpha + 0.3) : baseAlpha * 0.25) : baseAlpha;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = withAlpha(seriesColor(1), alpha);
        ctx.lineWidth = (connected ? 1.5 : 1) * (1 + 4 * edge.strength);
        ctx.stroke();
      }

      // Draw nodes.
      for (const node of nodes) {
        // Gold depth ring: brighter and thicker the stronger the card's peak pair.
        // A big node with no ring is broad support glue, not a synergy hub.
        if (node.primary && node.depth > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 2, 0, 2 * Math.PI);
          ctx.strokeStyle = withAlpha(seriesColor(2), 0.2 + 0.7 * node.depth);
          ctx.lineWidth = 1 + 3 * node.depth;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = nodeFill(node);
        ctx.fill();
        ctx.strokeStyle = nodeOutline(node, hovered);
        ctx.lineWidth = hovered === node.id ? 2 : 1;
        ctx.stroke();
      }

      // Draw hovered node label.
      if (hovered) {
        const node = nodes.find(n => n.id === hovered);
        if (node) {
          ctx.font = "13px monospace";
          ctx.fillStyle = currentChartTheme().text;
          ctx.textAlign = "center";
          const tag = node.peak > 0 ? `  (focal ${node.focalScore.toFixed(0)}, peak ${node.peak.toFixed(2)}x)` : "";
          ctx.fillText(node.id + tag, node.x, node.y - node.radius - 6);
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
  }, [synergyData, cube, matchStr, cardColorMap]);

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

  const colorSet = colorsFromMatch(matchStr);
  const colorMap = cardColorMap();
  const pairs = (synergyData?.pairs || []).filter(p => cardInColors(colorMap[p.card1], colorSet) && cardInColors(colorMap[p.card2], colorSet));
  const focalStats = (synergyData?.focal_stats || []).filter(s => cardInColors(colorMap[s.card_name], colorSet));
  if (pairs.length === 0 || focalStats.length === 0) {
    return null;
  }

  return (
    <div style={{textAlign: "center"}}>
      <ChartTitle title="Synergy Network Graph" description={
        <>
          Node size = focal score (breadth), color = identity, <span style={{color: seriesColor(2)}}>gold ring</span> = peak pair (depth). A big ring-less node is support glue, not a hub. <span style={{color: "var(--se-muted)"}}>Gray nodes</span> are below-cut partners pulled in so their hubs aren't left floating. Links scale with synergy. Hover to name, click to select, drag to move.
        </>
      } />
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
