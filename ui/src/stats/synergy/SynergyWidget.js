// The Synergy stats page: its option bar, the pairs and focal-point tables,
// and the charts. The pieces live in the other files here.

import React from 'react'
import { useComputedColorScheme } from "@mantine/core"
import { NumericInput, Checkbox, DropdownHeader } from "../../components/Dropdown.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { hasData } from "../../utils/dataKinds.js"
import { Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend, Title } from 'chart.js'
import { SynergyNetworkGraph } from "./SynergyNetworkGraph.js"
import { SynergyScatter } from "./SynergyScatter.js"
import { SynergyHubCompare } from "./SynergyHub.js"
import { FocalPointsTable, SynergyWidgetTable } from "./SynergyTables.js"
import { SynergyFocalCompare } from "./SynergyFocalCompare.js"
import { OptionTooltip } from "./synergyParts.js"

ChartJS.register(LinearScale, PointElement, Tooltip, Legend, Title);

export function SynergyWidget(input) {
  // Reading the color scheme re-renders the page when it changes, so the chart
  // colors computed below follow light and dark mode.
  useComputedColorScheme("light")

  if (!input.show) {
    return null
  }

  return (
    <div className="synergy-container">
      <SynergyWidgetOptions {...input} />
      <div className="synergy-pair-grid synergy-charts">
        <SynergyNetworkGraph
          synergyData={input.synergyData}
          cube={input.cube}
          matchStr={input.matchStr}
          onCardSelected={input.onCardSelected}
        />
        <SynergyScatter
          synergyData={input.synergyData}
          cube={input.cube}
          matchStr={input.matchStr}
          onCardSelected={input.onCardSelected}
        />
      </div>
      <div className="synergy-block">
        <SynergyHubCompare
          synergyData={input.synergyData}
          cube={input.cube}
          onCardSelected={input.onCardSelected}
        />
      </div>
      <div className="synergy-pair-grid synergy-tables">
        <SectionCard title="Synergistic Pairs">
          <SynergyWidgetTable {...input} />
        </SectionCard>
        <SectionCard title="Archetype Focal Points">
          <FocalPointsTable {...input} />
        </SectionCard>
      </div>
      <FocalCompare {...input} />
    </div>
  );
}

// FocalCompare compares build-around strength in winning and losing decks, so
// it needs match results.
function FocalCompare(input) {
  if (!hasData(input.info, "results")) {
    return null
  }

  return (
    <SynergyFocalCompare
      synergyCompare={input.synergyCompare}
      cube={input.cube}
      onCardSelected={input.onCardSelected}
    />
  )
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
        <RecordOption {...input} />
      </div>
    </div>
  );
}

// RecordOption narrows the source decks to winning or losing records. Cubes
// without match results have no records to narrow by, so it's left out.
function RecordOption(input) {
  if (!hasData(input.info, "results")) {
    return null
  }

  return (
    <OptionTooltip id="tip-record" header="Deck Record" tip="Restrict the source decks by match record. 'Winning' keeps decks that went 2-1 or better, 'losing' keeps 1-2 or worse. Compare the two to see which cards rise or fall between winning and losing decks.">
      <DropdownHeader
        label="Record"
        value={input.record}
        options={[{ label: "All decks", value: "all" }, { label: "Winning (2-1+)", value: "winning" }, { label: "Losing (1-2-)", value: "losing" }]}
        onChange={input.onRecordChanged}
      />
    </OptionTooltip>
  );
}
