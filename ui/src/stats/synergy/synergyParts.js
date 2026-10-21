// Small pieces several Synergy files share: an option's hover tip and a
// chart's title.

import React from 'react'
import { HoverInfo } from "../../components/kit/HoverInfo.js"

export function OptionTooltip({ id, header, tip, children }) {
  return (
    <HoverInfo title={header} info={tip} position="bottom">
      <div>{children}</div>
    </HoverInfo>
  );
}

// ChartTitle is the heading for a chart, with its description tucked into a hover
// popover so the charts stay compact and you only pull up the explanation when you
// want it. The ⓘ marks that there's something to hover.
export function ChartTitle({ title, description, align = "center" }) {
  return (
    <h4 style={{color: "var(--mantine-primary-color-filled)", marginBottom: "0.5rem", textAlign: align}}>
      <HoverInfo info={description} position="bottom" width={440}>
        <span style={{cursor: "help"}}>{title} <span style={{fontSize: "0.7em", opacity: 0.6}}>ⓘ</span></span>
      </HoverInfo>
    </h4>
  );
}
