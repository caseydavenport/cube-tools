// The Synergy scatter plot: each card's play rate against its average partner lift.

import React from 'react'
import { Scatter } from 'react-chartjs-2'
import { currentChartTheme, withAlpha } from "../../theme/chartTheme.js"
import { cardDisplayColor, cardInColors, colorsFromMatch, pointOutline } from "./synergyHelpers.js"
import { ChartTitle } from "./synergyParts.js"
import { SYNERGY_COPY } from "./copy.js"

// SynergyScatter plots cards with statistically significant synergy by how often
// they're played (x) against their average partner lift (y). Cards below the
// chance noise floor (avg lift 1.75) are dropped, so the bottom "low synergy"
// classes (goodstuff staples, filler) fall away and what's left splits left/right:
// low play = niche build-arounds, high play = established archetype cores.
// Reference lines sit at the medians of the surviving cards.
export function SynergyScatter({ synergyData, cube, matchStr, onCardSelected }) {
  const allStats = synergyData?.focal_stats || [];
  const totalDecks = synergyData?.total_decks || 0;

  const colorMap = {};
  if (cube && cube.cards) {
    for (const card of cube.cards) colorMap[card.name] = card.colors;
  }

  // Narrow to the colors picked in the global filter so the plot shows just those
  // cards, not every card in the decks that happen to run one.
  const colorSet = colorsFromMatch(matchStr);
  const stats = colorSet ? allStats.filter(s => cardInColors(colorMap[s.card_name], colorSet)) : allStats;
  if (stats.length === 0 || totalDecks === 0) {
    return null;
  }

  const K = 5;

  // Derive the noise floor from this pool's own prior (the mean lift we shrink
  // toward) instead of hardcoding it: the floor sits a fixed fraction above the
  // prior, ~1.6% (full pool prior ~1.723, null-shuffle p95 ~1.75). A sliced pool
  // shifts the prior, so the floor has to track it - a fixed 1.75 emptied the
  // winning pool, whose prior drops below it.
  const NOISE_FLOOR_MARGIN = 1.75 / 1.723;

  // Avg partner lift is a mean over a card's qualifying partners, so a card with
  // one strong partner is as noisy as a card opened in a single draft. The
  // qualifying-partner count is focal_score / avg_partner_lift (focal_score is the
  // sum of those lifts, avg is the mean). Shrink the avg toward the pooled field
  // mean with the same K pseudo-count used for play rate, so single-partner cards
  // don't sit as high as well-supported ones. Note the per-pair lift is already
  // shrunk toward 1.0 at the edge level; this is a second, aggregate-level shrink
  // of the card's average toward the field mean.
  const lifted = stats.filter(s => s.avg_partner_lift > 0);
  const totalLiftSum = lifted.reduce((acc, s) => acc + s.focal_score, 0);
  const totalPartners = lifted.reduce((acc, s) => acc + s.focal_score / s.avg_partner_lift, 0);
  const priorLift = totalPartners > 0 ? totalLiftSum / totalPartners : 0;
  const shrinkLift = (s) => {
    if (s.avg_partner_lift <= 0) return 0;
    const partners = s.focal_score / s.avg_partner_lift;
    return (s.focal_score + K * priorLift) / (partners + K);
  };

  // Keep cards above the pool's chance noise floor (below it isn't distinguishable
  // from chance, just clutter). A sliced pool can have too few clear it, leaving the
  // scatter blank, so when fewer than MIN_POINTS do, fall back to the top MIN_POINTS
  // by lift and flag the sub-floor ones as context.
  const MIN_POINTS = 8;
  const noiseFloor = priorLift * NOISE_FLOOR_MARGIN;
  const ranked = stats
    .filter(s => s.avg_partner_lift > 0)
    .map(s => ({ stat: s, lift: shrinkLift(s) }))
    .sort((a, b) => b.lift - a.lift);
  const aboveFloor = ranked.filter(r => r.lift >= noiseFloor);
  const usingFallback = aboveFloor.length < MIN_POINTS;
  const shown = usingFallback ? ranked.slice(0, MIN_POINTS) : aboveFloor;
  if (shown.length === 0) {
    return null;
  }

  // Play rate is a binomial proportion (maindecked / opened), so cards opened in
  // only a draft or two land at 0% or 100% on tiny samples and stretch the axis.
  // Shrink each rate toward the pooled mean with the same K pseudo-count: a
  // low-sample card sits near the field average and only earns an extreme position
  // once it has the opened drafts to back it up.
  const totalPlayed = shown.reduce((acc, r) => acc + r.stat.played_drafts, 0);
  const totalOpened = shown.reduce((acc, r) => acc + (r.stat.opened_drafts || 0), 0);
  const priorRate = totalOpened > 0 ? totalPlayed / totalOpened : 0;

  const points = shown.map(({ stat: s, lift }) => {
    // Play rate = drafts where the card was maindecked / drafts where it was
    // opened (seen in any mainboard, sideboard or pool). This is a singleton cube
    // drafted by 2-8 players, so scoping to drafts where the card was actually
    // opened avoids penalizing it for small drafts that never put it in a pack.
    const opened = s.opened_drafts || 0;
    const shrunk = (s.played_drafts + K * priorRate) / (opened + K);
    const rawDenom = opened > 0 ? opened : (s.played_drafts || 1);
    return {
      x: shrunk * 100,
      y: lift,
      name: s.card_name,
      deckCount: s.deck_count,
      playedDrafts: s.played_drafts,
      openedDrafts: s.opened_drafts,
      rawRate: (s.played_drafts / rawDenom) * 100,
      rawLift: s.avg_partner_lift,
      focalScore: s.focal_score,
      belowFloor: lift < noiseFloor,
    };
  });

  const median = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const medX = median(xs);
  const medY = median(ys);

  // Fit the y-axis tightly to the data range so the points spread out instead of
  // clustering near the center. Cards pile up against the hard noise floor at the
  // bottom, so give the lower end extra padding to keep them off the axis line.
  const fit = (vals, loFrac, hiFrac) => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const range = (hi - lo) || 1;
    return [lo - range * loFrac, hi + range * hiFrac];
  };
  const [yMin, yMax] = fit(ys, 0.18, 0.05);

  // Anchor the x-axis at zero so play rate distances are honest (a point twice
  // as far right really is played twice as often), ending just past the most-
  // played card rather than the full 0-100% that would crush everything left.
  const xMin = 0;
  const xMax = Math.max(...xs) * 1.05;

  const data = {
    datasets: [{
      label: SYNERGY_COPY.scatter.datasetLabel,
      data: points,
      // Below-floor cards (only shown in the fallback) render as hollow rings so
      // they read as context rather than as cards that cleared the noise floor.
      pointBackgroundColor: points.map(p => p.belowFloor ? "transparent" : cardDisplayColor(colorMap[p.name])),
      pointBorderColor: points.map(p => p.belowFloor ? cardDisplayColor(colorMap[p.name]) : pointOutline()),
      pointBorderWidth: points.map(p => p.belowFloor ? 1.5 : 1),
      pointRadius: points.map(p => p.belowFloor ? 4 : 5),
      pointHoverRadius: 8,
    }],
  };

  // Draw the median crosshairs that bound the four quadrants. Drawn solid and
  // bright so the quadrant boundaries are unmistakable.
  const medianLines = {
    id: "medianLines",
    afterDatasetsDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const px = scales.x.getPixelForValue(medX);
      const py = scales.y.getPixelForValue(medY);
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
      if (elements.length > 0 && onCardSelected) {
        const p = points[elements[0].index];
        onCardSelected({ currentTarget: { id: p.name } });
      }
    },
    scales: {
      x: {
        min: xMin,
        max: xMax,
        title: { display: true, text: SYNERGY_COPY.scatter.xAxisTitle, font: { size: 14 } },
      },
      y: {
        min: yMin,
        max: yMax,
        title: { display: true, text: SYNERGY_COPY.scatter.yAxisTitle, font: { size: 14 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => {
            const p = points[item.dataIndex];
            const flag = p.belowFloor ? SYNERGY_COPY.scatter.tooltipBelowFloor : "";
            return SYNERGY_COPY.scatter.tooltipLabel({
              name: p.name,
              flag: flag,
              played: p.playedDrafts,
              opened: p.openedDrafts,
              rawRate: p.rawRate.toFixed(1),
              adjRate: p.x.toFixed(1),
              rawLift: p.rawLift.toFixed(2),
              adjLift: p.y.toFixed(2),
              focal: p.focalScore.toFixed(1),
            });
          },
        },
      },
    },
  };

  return (
    <div style={{textAlign: "center"}}>
      <ChartTitle title={SYNERGY_COPY.scatter.title} description={
        <>
          {usingFallback
            ? SYNERGY_COPY.scatter.fallbackIntro({ shown: shown.length, above: aboveFloor.length, total: stats.length, floor: noiseFloor.toFixed(2) })
            : SYNERGY_COPY.scatter.normalIntro({ above: aboveFloor.length, total: stats.length, floor: noiseFloor.toFixed(2) })}
          {SYNERGY_COPY.scatter.description}
        </>
      } />
      <div style={{width: "min(600px, 100%)", aspectRatio: "1 / 1", margin: "0 auto"}}>
        <Scatter options={options} data={data} plugins={[medianLines]} />
      </div>
    </div>
  );
}
