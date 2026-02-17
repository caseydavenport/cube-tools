import React from 'react'
import { AggregatedPickInfo } from "../utils/DraftLog.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { SortFunc } from "../utils/Utils.js"
import { Button, TextInput, DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import {
  Tooltip as TooltipJS,
} from 'react-bootstrap';

export function DraftWidget(input) {
  if (!input.show) {
    return
  }
  if (input.drafts == null) {
    return
  }

  let picks = AggregatedPickInfo(input.drafts, input.cube, input.playerMatch)
  let pickList = []
  for (let [name, pick] of picks) {
    pickList.push(pick)
  }

  return (
    <div className="draft-container" style={{"display": "flex", "gap": "1.5rem", "padding": "1rem"}}>
      <div className="draft-order-section" style={{"flex": "1.5", "minWidth": "0"}}>
        <DraftOrderWidgetOptions {...input} />
        <div className="widget-scroll" style={{"marginTop": "1rem"}}>
          <DraftOrderWidget {...input} pickList={pickList} />
        </div>
      </div>

      <div className="draft-pack-section" style={{"flex": "1", "minWidth": "0"}}>
        <DraftPackWidgetOptions {...input} />
        <div className="widget-scroll" style={{"marginTop": "1rem", "padding": "1rem", "background": "var(--card-background)"}}>
          <DraftPackWidget {...input} />
        </div>
      </div>
    </div>
  );
}

function DraftOrderWidgetOptions(input) {
  return (
    <div className="selector-group" style={{"justifyContent": "center"}}>
      <NumericInput
        label="Min dev"
        value={input.minDeviation}
        onChange={input.onMinDeviationChanged}
      />
      <NumericInput
        label="Max dev"
        value={input.maxDeviation}
        onChange={input.onMaxDeviationChanged}
      />
      <NumericInput
        label="Min drafts"
        value={input.minDrafts}
        onChange={input.onMinDraftsSelected}
      />
      <NumericInput
        label="Min avg"
        value={input.minAvgPick}
        onChange={input.onMinAvgPickSelected}
      />
      <NumericInput
        label="Max avg"
        value={input.maxAvgPick}
        onChange={input.onMaxAvgPickSelected}
      />
    </div>
  );
}


function DraftOrderWidget(input) {
  let headers = [
    {
      id: "name",
      text: "Card name",
      tip: "The card's name."
    },
    {
      id: "count",
      text: "# Drafts",
      tip: "Number of drafts that have included this card.",
    },
    {
      id: "p1p1",
      text: "# P1P1",
      tip: "Number of times this card has been selected pick 1 of pack 1.",
    },
    {
      id: "avgp1pick",
      text: "Avg. p1 pick",
      tip: "Average pick, limited exclusively to instances where this card was present in pack #1.",
    },
    {
      id: "avgpick",
      text: "Avg. pick",
      tip: "Average pick for this card within a pack (i.e., out of 15).",
    },
    {
      id: "avgpickabs",
      text: "Avg. pick (abs)",
      tip: "Average pick for this card across all packs (i.e., out of 45). Mostly silly, but fun to look at.",
    },
    {
      id: "stddev",
      text: "Pick deviation",
      tip: "Pick order standard deviation. A higher number means this card has a higher variance in pick order.",
    },
    {
      id: "p1burn",
      text: "# P1 Burns",
      tip: "For drafts that burn cards, the number of times this card was burned in pack #1.",
    },
    {
      id: "burn",
      text: "# Burns",
      tip: "For drafts that burn cards, the number of times that this card was burned in total.",
    },
  ]
  return (
    <table className="widget-table">
      <thead className="table-header">
        <tr>
          {
            headers.map(function(hdr, i) {
              return (
                <OverlayTrigger
                  placement="top"
                  delay={{ show: 100, hide: 100 }}
                  overlay={
                    <Popover id="popover-basic">
                      <Popover.Header as="h3">{hdr.text}</Popover.Header>
                      <Popover.Body>
                        {hdr.tip}
                      </Popover.Body>
                    </Popover>
                  }
                >
                  <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                </OverlayTrigger>
              );
            })
          }
        </tr>
      </thead>
      <tbody>
        {
          input.pickList.map(function(pick) {
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
              <tr sort={sort} className="widget-table-row" key={pick.name}>
                <OverlayTrigger
                  placement="right"
                  delay={{ show: 500, hide: 100 }}
                  overlay={
                    <Popover id="popover-basic">
                      <Popover.Header as="h3">Picked by</Popover.Header>
                      <Popover.Body>
                        {DraftPickTooltipContent(pick)}
                      </Popover.Body>
                    </Popover>
                  }
                >
                  <td ><a href={pick.card.url} target="_blank" rel="noopener noreferrer">{pick.name}</a></td>
                </OverlayTrigger>

                <td>{pick.count}</td>
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
  );
}

function DraftPackWidgetOptions(input) {
  return (
    <div className="selector-group" style={{"justifyContent": "center"}}>
      <DropdownHeader
        label="Draft"
        options={input.draftLogs}
        value={input.selectedDraftLog}
        onChange={input.onDraftLogSelected}
      />

      <DropdownHeader
        label="Player"
        options={input.draftPlayers}
        value={input.selectedPlayer}
        onChange={input.onDraftPlayerSelected}
      />

      <DropdownHeader
        label="Pick #"
        options={input.draftPacks}
        value={input.selectedPack}
        onChange={input.onPackSelected}
      />
    </div>
  );
}


export function DraftPackWidget(input) {
  let draft = {users: []};
  for (var [idx, log] of Object.entries(input.drafts)) {
    if (log.date === input.selectedDraftLog) {
      draft = log;
      break;
    }
  }

  let player = null
  let pack = {booster: new Array()}
  let selectedCard = ""

  for (var [userID, user] of Object.entries(draft.users)) {
    if (user.userName == input.selectedPlayer) {
      player = user
      break
    }
  }
  if (player) {
    // Determine the pack. The dropdown starts from 1, but the array is zero-indexed.
    if (input.selectedPack > 0 && input.selectedPack <= player.picks.length) {
      pack = player.picks[input.selectedPack-1]
      // Determine which card this player picked from the pack.
      if (pack.pick.length > 0) {
        selectedCard = pack.booster[pack.pick[0]]
      }
    }
  }

  return (
    <div className="flexhouse" style={{"justifyContent": "center"}}>
      {
        pack.booster.map(function(cardID) {
          // Look up the card object based on the ID.
          let card = draft.carddata[cardID]
          if (!card) return null;
          let img = card.image_uris.en
          let className = "cardimage"
          let sort = "a"
          if (cardID === selectedCard) {
            className = "cardimage-selected"
            sort = "b"
          }
          return (
              <img key={cardID} sort={sort} src={img} className={className}/>
          )
        }).sort(SortFunc)
      }
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

