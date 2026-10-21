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
import { SYNERGY_COPY } from "./copy.js"
import "../stats.css"

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
        <SectionCard title={SYNERGY_COPY.widget.pairsTitle}>
          <SynergyWidgetTable {...input} />
        </SectionCard>
        <SectionCard title={SYNERGY_COPY.widget.focalPointsTitle}>
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
    <div className="scroll-container-large-header synergy-widget-full">
      <div className="selector-group">
        <div className="selection-cell">
          {SYNERGY_COPY.widget.showingPairs({ count: pairs.length })}
        </div>
        <OptionTooltip id="tip-min-decks" header={SYNERGY_COPY.widget.minDecksHeader} tip={SYNERGY_COPY.widget.minDecksTip}>
          <NumericInput
            label={SYNERGY_COPY.widget.minDecksLabel}
            value={input.minSynergyDecks}
            onChange={input.onMinSynergyDecksChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-focal" header={SYNERGY_COPY.widget.focalThresholdHeader} tip={SYNERGY_COPY.widget.focalThresholdTip}>
          <NumericInput
            label={SYNERGY_COPY.widget.focalThresholdLabel}
            value={input.focalThreshold}
            onChange={input.onFocalThresholdChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-smoothing" header={SYNERGY_COPY.widget.smoothingHeader} tip={SYNERGY_COPY.widget.smoothingTip}>
          <NumericInput
            label={SYNERGY_COPY.widget.smoothingLabel}
            value={input.smoothingK}
            onChange={input.onSmoothingKChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-color-adjust" header={SYNERGY_COPY.widget.colorAdjustHeader} tip={SYNERGY_COPY.widget.colorAdjustTip}>
          <Checkbox
            text={SYNERGY_COPY.widget.colorAdjustLabel}
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
    <OptionTooltip id="tip-record" header={SYNERGY_COPY.widget.recordHeader} tip={SYNERGY_COPY.widget.recordTip}>
      <DropdownHeader
        label={SYNERGY_COPY.widget.recordLabel}
        value={input.record}
        options={[{ label: SYNERGY_COPY.widget.recordAll, value: "all" }, { label: SYNERGY_COPY.widget.recordWinning, value: "winning" }, { label: SYNERGY_COPY.widget.recordLosing, value: "losing" }]}
        onChange={input.onRecordChanged}
      />
    </OptionTooltip>
  );
}
