import React from 'react'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { bucketXScale } from "../utils/Buckets.js";
import { EmptyState } from "../components/kit/EmptyState.js"
import { chartTooltip, currentChartTheme, seriesColor } from "../theme/chartTheme.js"
import { visibleItems } from "../utils/dataKinds.js"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// COPY holds every piece of text on the Health page. These are placeholders
// for Casey to replace.
const COPY = {
  chartTitle: ({ name, bucketSize }) => `${name} (bucket size = ${bucketSize} drafts)`,

  archetypeEvenness: {
    name: "Archetype Evenness",
    description: "Shannon entropy of macro archetype distribution (aggro/midrange/control), normalized 0-1. Higher = more balanced.",
  },
  colorBalance: {
    name: "Color Balance StdDev",
    description: "Standard deviation of win rates across the 10 dual color pairs. Lower = more balanced.",
  },
  trophyGini: {
    name: "Trophy Gini Coefficient",
    description: "Gini coefficient of trophy counts across macro archetypes. Lower = more evenly distributed trophies.",
  },
  avgWordCount: {
    name: "Avg Word Count",
    description: "Average word count per non-land mainboarded card, excluding reminder text. Higher = wordier cards being played.",
  },
  numDecks: {
    name: "Decks per Bucket",
    description: "Number of decks in each bucket, for context.",
  },
}

// HEALTH_CHARTS are the charts of how balanced the cube plays over time. needs
// lists the data each is built from: trophies and color win rates need match
// results, and archetype evenness needs archetype labels.
const HEALTH_CHARTS = [
  {
    field: "archetype_evenness",
    name: COPY.archetypeEvenness.name,
    needs: ["archetypes"],
    min: 0,
    max: 1,
    description: COPY.archetypeEvenness.description,
  },
  {
    field: "color_balance_stddev",
    name: COPY.colorBalance.name,
    needs: ["results"],
    min: 0,
    max: null,
    description: COPY.colorBalance.description,
  },
  {
    field: "trophy_gini",
    name: COPY.trophyGini.name,
    needs: ["results"],
    min: 0,
    max: 1,
    description: COPY.trophyGini.description,
  },
  {
    field: "avg_word_count",
    name: COPY.avgWordCount.name,
    min: null,
    max: null,
    description: COPY.avgWordCount.description,
  },
  {
    field: "num_decks",
    name: COPY.numDecks.name,
    min: 0,
    max: null,
    description: COPY.numDecks.description,
  },
]

// HealthWidget is the Health page: one line chart per health measure the cube
// can fill, two to a row.
export function HealthWidget(input) {
  if (!input.show) {
    return null;
  }

  const buckets = input.healthData || [];
  if (buckets.length === 0) {
    return <EmptyState>{input.copy.noHealthData}</EmptyState>;
  }

  const labels = buckets.map(b => b.start);
  const charts = visibleItems(HEALTH_CHARTS, input.info);

  return (
    <div className="health-grid">
      {charts.map((chart, index) => (
        <div key={chart.field} className="health-chart">
          <HealthChart
            labels={labels}
            data={buckets.map(b => b[chart.field])}
            title={COPY.chartTitle({ name: chart.name, bucketSize: input.bucketSize })}
            color={seriesColor(index)}
            min={chart.min}
            max={chart.max}
            description={chart.description}
          />
        </div>
      ))}
    </div>
  );
}

function HealthChart({ labels, data, title, color, min, max, description }) {
  const computedMax = max !== null ? max : Math.ceil(Math.max(...data) * 1.1);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    borderWidth: 3,
    scales: {
      x: bucketXScale,
      y: {
        min: min,
        max: computedMax,
      },
    },
    hover: {
      mode: 'dataset',
    },
    elements: {
      point: {
        hitRadius: 10,
      },
    },
    plugins: {
      title: {
        display: true,
        text: title,
        font: { size: "16pt" },
      },
      legend: {
        display: false,
      },
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: {
          footer: () => description,
        },
      }),
    },
  };

  const chartData = {
    labels,
    datasets: [{
      label: title,
      data: data,
      borderColor: color,
      backgroundColor: color,
    }],
  };

  return <Line options={options} data={chartData} />;
}
