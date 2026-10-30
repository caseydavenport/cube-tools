package stats

import (
	"cmp"
	"encoding/json"
	"slices"

	"github.com/sirupsen/logrus"
)

// DraftLogReader reads a draft's raw pick log. *storage.Store satisfies it.
type DraftLogReader interface {
	GetDraftLog(cube string, draftID int) (json.RawMessage, error)
}

// CardPick is one time a player took the card in a logged draft. Pack and
// Pick count from 1.
type CardPick struct {
	DraftID int    `json:"draft_id"`
	Date    string `json:"date"`
	Player  string `json:"player"`
	Pack    int    `json:"pack"`
	Pick    int    `json:"pick"`
}

// draftLogFile is the part of a draft log the card page reads: each seat's
// picks, and the card names behind the log's card IDs.
type draftLogFile struct {
	Users    map[string]draftLogUser `json:"users"`
	CardData map[string]draftLogCard `json:"carddata"`
}

// draftLogUser is one seat in a draft log.
type draftLogUser struct {
	UserName string         `json:"userName"`
	IsBot    bool           `json:"isBot"`
	Picks    []draftLogPick `json:"picks"`
}

// draftLogPick is one pick: the booster's card IDs and the index of the card
// taken. Logs store the taken index as a list, though it holds one entry.
type draftLogPick struct {
	PackNum int      `json:"packNum"`
	PickNum int      `json:"pickNum"`
	Pick    []int    `json:"pick"`
	Booster []string `json:"booster"`
}

// draftLogCard names one card ID in a draft log.
type draftLogCard struct {
	Name string `json:"name"`
}

// cardPicks finds every time a person took the card across the draft logs,
// keyed by draft ID, ordered by date, draft, pack and pick. dates gives each
// draft's date. Bots are skipped, and a log that doesn't decode is logged and
// skipped.
func cardPicks(card string, logs map[int]json.RawMessage, dates map[int]string) []CardPick {
	out := []CardPick{}
	for draftID, raw := range logs {
		var log draftLogFile
		if err := json.Unmarshal(raw, &log); err != nil {
			logrus.WithError(err).WithField("draft", draftID).Warn("could not decode draft log")
			continue
		}
		for _, user := range log.Users {
			if user.IsBot {
				continue
			}
			for _, p := range user.Picks {
				if pickedName(log, p) != card {
					continue
				}
				out = append(out, CardPick{DraftID: draftID, Date: dates[draftID], Player: user.UserName, Pack: p.PackNum + 1, Pick: p.PickNum + 1})
			}
		}
	}
	slices.SortFunc(out, func(a, b CardPick) int {
		return cmp.Or(cmp.Compare(a.Date, b.Date), cmp.Compare(a.DraftID, b.DraftID), cmp.Compare(a.Pack, b.Pack), cmp.Compare(a.Pick, b.Pick))
	})
	return out
}

// pickedName is the name of the card taken in a pick, or "" when the pick
// doesn't say.
func pickedName(log draftLogFile, p draftLogPick) string {
	if len(p.Pick) == 0 || p.Pick[0] < 0 || p.Pick[0] >= len(p.Booster) {
		return ""
	}
	return log.CardData[p.Booster[p.Pick[0]]].Name
}
