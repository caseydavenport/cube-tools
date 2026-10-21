import React from 'react'
import { SortFunc } from "../utils/Utils.js"
import { CardImagePreview } from "../components/kit/CardImagePreview.js"

// DraftPackWidget shows one pack from a pick log: the pack the selected player
// saw at the selected pick, with the card they took highlighted. drafts maps
// any key to a log; the log whose draft id matches selectedDraftLog is shown.
export function DraftPackWidget(input) {
  let draft = {users: []};
  for (var [idx, log] of Object.entries(input.drafts)) {
    if (String(log.draft.id) === String(input.selectedDraftLog)) {
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
            <CardImagePreview key={cardID} sort={sort} src={img} alt={card.name} width={250} position="right">
              <img src={img} className={className}/>
            </CardImagePreview>
          )
        }).sort(SortFunc)
      }
    </div>
  );
}
