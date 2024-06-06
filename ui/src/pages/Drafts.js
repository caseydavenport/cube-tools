import React from 'react'
import { AggregatedPickInfo } from "../utils/DraftLog.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { SortFunc } from "../utils/Utils.js"
import { Button, TextInput, DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"

function DraftOrderWidgetOptions(input) {
  return (
    <table className="dropdown-header">
      <tbody>
        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min deviation"
              value={input.minDeviation}
              onChange={input.onMinDeviationChanged}
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Max deviation"
              value={input.maxDeviation}
              onChange={input.onMaxDeviationChanged}
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Min # drafts"
              value={input.minDrafts}
              onChange={input.onMinDraftsSelected}
            />
          </td>
        </tr>

        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min avg. pick"
              value={input.minAvgPick}
              onChange={input.onMinAvgPickSelected}
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Max avg. pick"
              value={input.maxAvgPick}
              onChange={input.onMaxAvgPickSelected}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}


export function DraftOrderWidget(input) {
  if (!input.show) {
    return null
  }
  if (input.drafts == null) {
    return null
  }
  let picks = AggregatedPickInfo(input.drafts, input.cube, input.playerMatch)
  let pickList = []
  for (let [name, pick] of picks) {
    pickList.push(pick)
  }

  return (
    <div>

      <DraftOrderWidgetOptions {...input} />

      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Card name</td>
            <td onClick={input.onHeaderClick} id="count" className="header-cell"># Drafts</td>
            <td onClick={input.onHeaderClick} id="p1p1" className="header-cell"># P1P1</td>
            <td onClick={input.onHeaderClick} id="avgp1pick" className="header-cell">Avg. p1 pick</td>
            <td onClick={input.onHeaderClick} id="avgpick" className="header-cell">Avg. pick</td>
            <td onClick={input.onHeaderClick} id="avgpickabs" className="header-cell">Avg. pick (abs)</td>
            <td onClick={input.onHeaderClick} id="stddev" className="header-cell">Pick deviation</td>
            <td onClick={input.onHeaderClick} id="p1burn" className="header-cell"># P1 Burns</td>
            <td onClick={input.onHeaderClick} id="burn" className="header-cell"># Burns</td>
          </tr>
        </thead>
        <tbody>
          {
            pickList.map(function(pick) {
              // Filter out any picks that don't meet the filter criteria.
              if (input.minDrafts > 0 && pick.count < input.minDrafts) {
                return
              }

              let avgPackPick = "-"
              let avgPackPickAbsolute = "-"
              if (pick.count > 0) {
                avgPackPick = Math.round(pick.pickNumSum / pick.count * 10) / 10
                avgPackPickAbsolute = Math.round(pick.pickNumSumAbs / pick.count * 10) / 10
              }

              // Filter based on average pack pick.
              if (input.minAvgPick > 0 && avgPackPick < input.minAvgPick) {
                return
              }
              if (input.maxAvgPick > 0 && avgPackPick > input.maxAvgPick) {
                return
              }

              let avgPack1Pick = "-"
              if (pick.p1count > 0) {
                avgPack1Pick = Math.round(pick.p1PickNumSum / pick.p1count * 100) / 100
              }

              let firstPicks = "-"
              if (pick.firstPicks > 0) {
                firstPicks = pick.firstPicks
              }

              let burns = "-"
              if (pick.burns > 0) {
                burns = pick.burns
              }

              let p1burns = "-"
              if (pick.p1burns > 0) {
                p1burns = pick.p1burns
              }

              // Calculate the standard deviation for this card.
              let sumOfSquares = 0
              for (let p of pick.picks) {
                let diff = avgPackPick - p.pick
                sumOfSquares += diff*diff
              }
              let stddev = Math.round(Math.sqrt(sumOfSquares / pick.count)*10) / 10

              // Filter out if the pick doesn't meet deviation filter.
              if (input.minDeviation > 0 && stddev < input.minDeviation) {
                return
              }
              if (input.maxDeviation > 0 && stddev > input.maxDeviation) {
                return
              }


              let sort = pick.count
              if (input.sortBy === "p1p1") {
                sort = pick.firstPicks
              } else if (input.sortBy === "avgp1pick") {
                sort = avgPack1Pick
              } else if (input.sortBy === "avgpick") {
                sort = avgPackPick
              } else if (input.sortBy === "avgpickabs") {
                sort = avgPackPickAbsolute
              } else if (input.sortBy === "burn") {
                sort = pick.burns
              } else if (input.sortBy === "p1burn") {
                sort = pick.p1burns
              } else if (input.sortBy === "name") {
                sort = pick.name
              } else if (input.sortBy === "count") {
                sort = pick.count
              } else if (input.sortBy === "stddev") {
                sort = stddev
              }

              if (sort == "-") {
                // Treat empty values as last always. That means a negataive number
                // for normal sorting, and a big positive one for inverted sorting.
                sort = -1
                if (input.invertSort) {
                  sort = 100000
                }
              }

              if (input.invertSort) {
                sort = -1 * sort
              }

              return (
                <tr sort={sort} className="card" key={pick.name}>
                  <td className="card"><a href={pick.card.url} target="_blank" rel="noopener noreferrer">{pick.name}</a></td>
                  <td><ApplyTooltip text={pick.count} hidden={DraftPickTooltipContent(pick)}/></td>
                  <td>{firstPicks}</td>
                  <td>{avgPack1Pick}</td>
                  <td>{avgPackPick}</td>
                  <td>{avgPackPickAbsolute}</td>
                  <td>{stddev}</td>
                  <td>{p1burns}</td>
                  <td>{burns}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
      </div>
  );
}

function DraftPickTooltipContent(pick) {
  let k = 0
  return (
    <div>
      <table>
        <thead className="table-header">
          <tr>
            <td id="name" className="header-cell">Date</td>
            <td id="name" className="header-cell">Player</td>
            <td id="pack" className="header-cell">Pack</td>
            <td id="pick" className="header-cell">Pick</td>
          </tr>
        </thead>
        <tbody>
        {
          pick.picks.map(function(pick) {
            k += 1
            return (
              <tr key={k}>
                <td>{pick.date}</td>
                <td>{pick.player}</td>
                <td>{pick.pack + 1}</td>
                <td>{pick.pick + 1}</td>
              </tr>
            )
          })
        }
        </tbody>
      </table>
    </div>
  )
}

