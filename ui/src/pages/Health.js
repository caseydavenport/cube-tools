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
import { seriesColor } from "../theme/chartTheme.js"
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

// HEALTH_CHARTS are the charts of how balanced the cube plays over time. needs
// lists the data each is built from: trophies and color win rates need match
// results, and archetype evenness needs archetype labels.
const HEALTH_CHARTS = [
  {
    field: "archetype_evenness",
    name: "Archetype Evenness",
    needs: ["archetypes"],
    min: 0,
    max: 1,
    description: "Shannon entropy of macro archetype distribution (aggro/midrange/control), normalized 0-1. Higher = more balanced.",
  },
  {
    field: "color_balance_stddev",
    name: "Color Balance StdDev",
    needs: ["results"],
    min: 0,
    max: null,
    description: "Standard deviation of win rates across the 10 dual color pairs. Lower = more balanced.",
  },
  {
    field: "trophy_gini",
    name: "Trophy Gini Coefficient",
    needs: ["results"],
    min: 0,
    max: 1,
    description: "Gini coefficient of trophy counts across macro archetypes. Lower = more evenly distributed trophies.",
  },
  {
    field: "avg_word_count",
    name: "Avg Word Count",
    min: null,
    max: null,
    description: "Average word count per non-land mainboarded card, excluding reminder text. Higher = wordier cards being played.",
  },
  {
    field: "num_decks",
    name: "Decks per Bucket",
    min: 0,
    max: null,
    description: "Number of decks in each bucket, for context.",
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
            title={`${chart.name} (bucket size = ${input.bucketSize} drafts)`}
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
      tooltip: {
        callbacks: {
          footer: () => description,
        },
      },
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
