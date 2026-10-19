import React from "react"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { ColorImages, CUBE_AVG_WIN_PERCENT } from "../utils/Colors.js"
import { MANA } from "../theme/tokens.js"
import { pageHref } from "../shell/paths.js"
import { HOME_BLOCKS, blockState } from "./homeBlocks.js"
import { BlockBody } from "./BlockBody.js"

// ColorBar is one color's row: its mana icon, a bar filled to its win rate with
// a tick at the cube average, and the percentage.
function ColorBar({ rate }) {
  const fill = { width: `${rate.winPercent}%`, background: MANA[rate.color] }
  const tick = { left: `${CUBE_AVG_WIN_PERCENT}%` }

  return (
    <div className="home-color-row">
      {ColorImages(rate.color)}
      <div className="home-bar-track">
        <div className="home-bar-fill" style={fill} />
        <div className="home-bar-tick" style={tick} />
      </div>
      <span className="home-bar-value">{Math.round(rate.winPercent)}%</span>
    </div>
  )
}

// ColorWinRatesCard shows each color's win rate against the cube average.
export function ColorWinRatesCard({ cube, home, info, copy }) {
  return (
    <SectionCard title={copy.colorWinRates} linkLabel={copy.colorsLink} href={pageHref(cube, "colors")}>
      <BlockBody
        state={blockState(HOME_BLOCKS.colorWinRates, info)}
        value={home.colorRates}
        error={home.errors.colors}
        errorText={copy.error}
        loadingHeight={150}
        render={rates => {
          if (rates.length === 0) {
            return <EmptyState>{copy.noData}</EmptyState>
          }
          return rates.map(r => <ColorBar key={r.color} rate={r} />)
        }}
      />
    </SectionCard>
  )
}
