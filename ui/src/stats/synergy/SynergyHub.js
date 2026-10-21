// Hub cards against the support cards around them: the comparison chart,
// the hub chart, and a hub card's details.

import React, { useState } from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { Scatter } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, withAlpha } from "../../theme/chartTheme.js"
import { cardDisplayColor, median, pointOutline } from "./synergyHelpers.js"
import { ChartTitle } from "./synergyParts.js"
import { SYNERGY_COPY } from "./copy.js"

// The color buckets offered by each hub-scatter dropdown. Mono colors use the
// "identity contains this color" rule (so a UW card shows under both White and
// Blue); gold is multicolor, colorless is no color identity.
const HUB_COLOR_OPTIONS = [
  { label: SYNERGY_COPY.hub.colorAll, value: "all" },
  { label: SYNERGY_COPY.hub.colorWhite, value: "W" },
  { label: SYNERGY_COPY.hub.colorBlue, value: "U" },
  { label: SYNERGY_COPY.hub.colorBlack, value: "B" },
  { label: SYNERGY_COPY.hub.colorRed, value: "R" },
  { label: SYNERGY_COPY.hub.colorGreen, value: "G" },
  { label: SYNERGY_COPY.hub.colorMulticolor, value: "gold" },
  { label: SYNERGY_COPY.hub.colorColorless, value: "colorless" },
];

// MIN_HUB_DECK_COUNT guards the hub scatter's per-deck breadth axis. Breadth is
// focal score divided by the number of decks the card appeared in, so a card seen
// in only a deck or two can spike on a single lucky pair. Drop those below the floor
// rather than let them distort the axis.
const MIN_HUB_DECK_COUNT = 3;

// cardInHubBucket tests a card's color identity against one of the dropdown buckets.
function cardInHubBucket(colors, bucket) {
  const c = colors || [];
  switch (bucket) {
    case "all": return true;
    case "gold": return c.length > 1;
    case "colorless": return c.length === 0;
    default: return c.includes(bucket);
  }
}

// SynergyHubCompare shows two hub-vs-support scatters side by side, each with its
// own color dropdown, so you can compare the "shape" of one color against another
// (e.g. White vs Blue). Both charts share a single axis scale and median crosshairs
// computed across the whole pool, so a point in the same spot means the same thing
// in both and the axes don't shift when you change a dropdown.
export function SynergyHubCompare({ synergyData, cube, onCardSelected }) {
  const [leftColor, setLeftColor] = useState("W");
  const [rightColor, setRightColor] = useState("U");
  // The point clicked in either chart, shown in the detail panel between them.
  const [selected, setSelected] = useState(null);

  const stats = synergyData?.focal_stats || [];

  const colorMap = {};
  if (cube && cube.cards) {
    for (const card of cube.cards) colorMap[card.name] = card.colors;
  }

  // The full pool feeds both the shared axes and each chart's per-color slice.
  // x is breadth per deck: total focal score divided by the decks the card showed
  // up in, so a heavily-played card doesn't read as a hub just from accumulating
  // partners. Cards below the deck-count floor are dropped so a thin sample can't
  // spike the axis.
  const pool = stats
    .filter(s => s.focal_score > 0 && s.peak_synergy > 0 && s.deck_count >= MIN_HUB_DECK_COUNT)
    .map(s => ({
      x: s.focal_score / s.deck_count,
      y: s.peak_synergy,
      name: s.card_name,
      density: s.focal_score / s.deck_count,
      focalScore: s.focal_score,
      deckCount: s.deck_count,
      peak: s.peak_synergy,
      // top_partners is strongest-first, so the first one is the peak partner.
      peakPartner: (s.top_partners && s.top_partners[0]) || "",
      peakSaturation: s.peak_saturation,
      topPartners: s.top_partners || [],
      topPartnerSynergies: s.top_partner_synergies || [],
      topPartnerSaturations: s.top_partner_saturations || [],
    }));
  if (pool.length === 0) {
    return null;
  }

  // Shared scale + crosshairs across the whole pool, so both charts line up.
  const xs = pool.map(p => p.x);
  const ys = pool.map(p => p.y);
  // Breadth starts at 0 (it's a sum, so distances mean something). Peak axis fit
  // tight so the cards spread out instead of bunching up.
  const yLo = Math.min(...ys);
  const yHi = Math.max(...ys);
  const yRange = (yHi - yLo) || 1;
  const scale = {
    xMax: Math.max(...xs) * 1.05,
    yMin: yLo - yRange * 0.1,
    yMax: yHi + yRange * 0.05,
    medX: median(xs),
    medY: median(ys),
  };

  return (
    <div style={{textAlign: "center"}}>
      <ChartTitle title={SYNERGY_COPY.hub.title} description={SYNERGY_COPY.hub.description} />
      <div className="synergy-hub-grid">
        <SynergyHubChart
          pool={pool}
          colorMap={colorMap}
          scale={scale}
          color={leftColor}
          selectedName={selected?.name}
          onColorChange={(e) => setLeftColor(e.target.value)}
          onPointClick={(p) => { setSelected(p); if (onCardSelected) onCardSelected({ currentTarget: { id: p.name } }); }}
        />
        <HubCardDetail point={selected} colorMap={colorMap} />
        <SynergyHubChart
          pool={pool}
          colorMap={colorMap}
          scale={scale}
          color={rightColor}
          selectedName={selected?.name}
          onColorChange={(e) => setRightColor(e.target.value)}
          onPointClick={(p) => { setSelected(p); if (onCardSelected) onCardSelected({ currentTarget: { id: p.name } }); }}
        />
      </div>
    </div>
  );
}

// HubCardDetail is the panel between the two hub scatters. It's empty (a hint) until
// you click a point, then it lays out that card's axis values and top synergy
// partners in a compact table so the comparison has a readable detail view in the
// middle instead of relying on a transient tooltip.
function HubCardDetail({ point, colorMap }) {
  const panel = {
    width: "240px",
    minHeight: "120px",
    padding: "0.75rem",
    // copy-ok: CSS value
    border: "1px solid var(--se-border)",
    borderRadius: "6px",
    background: "var(--se-card)",
    fontSize: "0.85em",
  };

  if (!point) {
    return (
      <div style={{...panel, color: "var(--se-muted)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center"}}>
        {SYNERGY_COPY.hub.detailHint}
      </div>
    );
  }

  const row = (label, value) => (
    <tr>
      <td style={{color: "var(--se-muted)", paddingRight: "0.75rem", whiteSpace: "nowrap"}}>{label}</td>
      <td style={{textAlign: "right", fontVariantNumeric: "tabular-nums"}}>{value}</td>
    </tr>
  );

  const peakWith = point.peakPartner ? SYNERGY_COPY.hub.detailPeakWith({ partner: point.peakPartner }) : "";
  const pct = (v) => v != null ? `${Math.round(v * 100)}%` : "";

  return (
    <div style={panel}>
      <div style={{color: cardDisplayColor(colorMap[point.name]), fontWeight: "bold", marginBottom: "0.5rem", textAlign: "center"}}>
        {point.name}
      </div>
      <table style={{width: "100%", marginBottom: "0.6rem"}}>
        <tbody>
          {row(SYNERGY_COPY.hub.detailBreadth, point.density.toFixed(2))}
          {row(SYNERGY_COPY.hub.detailPeak, SYNERGY_COPY.hub.detailPeakValue({ peak: point.peak.toFixed(2), saturation: pct(point.peakSaturation), peakWith: peakWith }))}
          {row(SYNERGY_COPY.hub.detailFocalScore, point.focalScore.toFixed(1))}
          {row(SYNERGY_COPY.hub.detailDecks, point.deckCount)}
        </tbody>
      </table>
      <div style={{color: "var(--se-muted)", borderTop: "1px solid var(--se-border)", paddingTop: "0.4rem", marginBottom: "0.3rem"}}>
        {SYNERGY_COPY.hub.detailTopPartners} <span style={{opacity: 0.7}}>{SYNERGY_COPY.hub.detailTopPartnersKey}</span>
      </div>
      <table style={{width: "100%"}}>
        <tbody>
          {point.topPartners.length === 0
            ? <tr><td style={{color: "var(--se-muted)"}}>{SYNERGY_COPY.hub.detailNoPartners}</td></tr>
            : point.topPartners.map((name, i) => (
              <tr key={name}>
                <td style={{color: cardDisplayColor(colorMap[name]), paddingRight: "0.75rem"}}>{name}</td>
                <td style={{textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap"}}>
                  {point.topPartnerSynergies[i] != null ? SYNERGY_COPY.hub.detailPartnerLift({ lift: point.topPartnerSynergies[i].toFixed(2) }) : ""}
                  {point.topPartnerSaturations[i] != null ? SYNERGY_COPY.hub.detailPartnerSaturation({ saturation: pct(point.topPartnerSaturations[i]) }) : ""}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// SynergyHubChart is one hub-vs-support scatter: x is breadth per deck (focal score
// over the decks the card appeared in), y is depth (the single strongest pair). Glue like
// removal scores high breadth off lots of weak pairs but no strong one, so it lands
// bottom-right; real hubs sit top-right, niche build-arounds top-left. It draws on
// the shared scale handed down by SynergyHubCompare and shows only the picked color.
function SynergyHubChart({ pool, colorMap, scale, color, selectedName, onColorChange, onPointClick }) {
  const points = pool.filter(p => cardInHubBucket(colorMap[p.name], color));

  // The clicked card, if it's in this chart's color slice, gets a bigger white-ringed
  // dot so the detail panel's card is easy to spot across both charts.
  const isSelected = (p) => p.name === selectedName;

  const data = {
    datasets: [{
      label: SYNERGY_COPY.hub.datasetLabel,
      data: points,
      pointBackgroundColor: points.map(p => cardDisplayColor(colorMap[p.name])),
      pointBorderColor: points.map(p => isSelected(p) ? currentChartTheme().text : pointOutline()),
      pointBorderWidth: points.map(p => isSelected(p) ? 3 : 1),
      pointRadius: points.map(p => isSelected(p) ? 8 : 5),
      pointHoverRadius: points.map(p => isSelected(p) ? 10 : 8),
    }],
  };

  const medianLines = {
    id: "hubMedianLines",
    afterDatasetsDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const px = scales.x.getPixelForValue(scale.medX);
      const py = scales.y.getPixelForValue(scale.medY);
      ctx.save();
      ctx.strokeStyle = withAlpha(currentChartTheme().text, 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, chartArea.top);
      ctx.lineTo(px, chartArea.bottom);
      ctx.moveTo(chartArea.left, py);
      ctx.lineTo(chartArea.right, py);
      ctx.stroke();
      ctx.restore();
    },
  };

  const options = {
    maintainAspectRatio: false,
    onClick: (e, elements) => {
      if (elements.length > 0 && onPointClick) {
        onPointClick(points[elements[0].index]);
      }
    },
    scales: {
      x: {
        min: 0,
        max: scale.xMax,
        title: { display: true, text: SYNERGY_COPY.hub.xAxisTitle, font: { size: 14 } },
      },
      y: {
        min: scale.yMin,
        max: scale.yMax,
        title: { display: true, text: SYNERGY_COPY.hub.yAxisTitle, font: { size: 14 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: {
          label: (item) => {
            const p = points[item.dataIndex];
            const peakWith = p.peakPartner ? SYNERGY_COPY.hub.tooltipPeakWith({ partner: p.peakPartner }) : "";
            return SYNERGY_COPY.hub.tooltipLabel({
              name: p.name,
              breadth: p.density.toFixed(2),
              focal: p.focalScore.toFixed(1),
              decks: p.deckCount,
              peak: p.peak.toFixed(2),
              peakWith: peakWith,
            });
          },
        },
      }),
    },
  };

  return (
    <div style={{textAlign: "center"}}>
      <DropdownHeader
        label={SYNERGY_COPY.hub.colorDropdownLabel}
        value={color}
        options={HUB_COLOR_OPTIONS}
        onChange={onColorChange}
      />
      <div style={{width: "min(500px, 100%)", aspectRatio: "1 / 1", margin: "0 auto"}}>
        {points.length > 0
          ? <Scatter options={options} data={data} plugins={[medianLines]} />
          : <div style={{color: "var(--se-muted)", paddingTop: "2rem"}}>{SYNERGY_COPY.hub.noCards}</div>}
      </div>
    </div>
  );
}
