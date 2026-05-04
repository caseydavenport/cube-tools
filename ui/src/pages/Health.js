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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export function HealthWidget(input) {
  if (!input.show) {
    return null;
  }

  const buckets = input.healthData || [];
  if (buckets.length === 0) {
    return <div style={{padding: "2rem", textAlign: "center", color: "var(--text-muted)"}}>No health data available.</div>;
  }

  const labels = buckets.map(b => b.name);

  return (
    <div style={{padding: "1rem"}}>
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem"}}>
        <div style={{height: "500px"}}>
          <HealthChart
            labels={labels}
            data={buckets.map(b => b.archetype_evenness)}
            title={`Archetype Evenness (bucket size = ${input.bucketSize} drafts)`}
            color="rgba(75, 192, 192, 1)"
            min={0}
            max={1}
            description="Shannon entropy of macro archetype distribution (aggro/midrange/control/tempo), normalized 0-1. Higher = more balanced."
          />
        </div>
        <div style={{height: "500px"}}>
          <HealthChart
            labels={labels}
            data={buckets.map(b => b.color_balance_stddev)}
            title={`Color Balance StdDev (bucket size = ${input.bucketSize} drafts)`}
            color="rgba(255, 159, 64, 1)"
            min={0}
            max={null}
            description="Standard deviation of win rates across the 10 dual color pairs. Lower = more balanced."
          />
        </div>
        <div style={{height: "500px"}}>
          <HealthChart
            labels={labels}
            data={buckets.map(b => b.trophy_gini)}
            title={`Trophy Gini Coefficient (bucket size = ${input.bucketSize} drafts)`}
            color="rgba(153, 102, 255, 1)"
            min={0}
            max={1}
            description="Gini coefficient of trophy counts across macro archetypes. Lower = more evenly distributed trophies."
          />
        </div>
        <div style={{height: "500px"}}>
          <HealthChart
            labels={labels}
            data={buckets.map(b => b.avg_word_count)}
            title={`Avg Word Count (bucket size = ${input.bucketSize} drafts)`}
            color="rgba(255, 206, 86, 1)"
            min={null}
            max={null}
            description="Average word count per non-land mainboarded card, excluding reminder text. Higher = wordier cards being played."
          />
        </div>
        <div style={{height: "500px"}}>
          <HealthChart
            labels={labels}
            data={buckets.map(b => b.num_decks)}
            title={`Decks per Bucket (bucket size = ${input.bucketSize} drafts)`}
            color="rgba(54, 162, 235, 1)"
            min={0}
            max={null}
            description="Number of decks in each bucket, for context."
          />
        </div>
      </div>
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
        color: "#FFF",
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
