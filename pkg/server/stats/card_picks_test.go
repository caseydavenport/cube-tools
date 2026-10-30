package stats

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

// pickLog is a two-seat draft log: Freddie takes Goblin Bombardment fifth in
// the first pack, and a bot takes it first in the second.
const pickLog = `{
	"carddata": {"c1": {"name": "Goblin Bombardment"}, "c2": {"name": "Shock"}},
	"users": {
		"u1": {"userName": "Freddie", "isBot": false, "picks": [
			{"packNum": 0, "pickNum": 4, "pick": [1], "booster": ["c2", "c1"]},
			{"packNum": 1, "pickNum": 0, "pick": [0], "booster": ["c2"]}
		]},
		"u2": {"userName": "Bot", "isBot": true, "picks": [
			{"packNum": 1, "pickNum": 0, "pick": [0], "booster": ["c1"]}
		]}
	}
}`

func TestCardPicks_FindsHumanPicks(t *testing.T) {
	logs := map[int]json.RawMessage{31: json.RawMessage(pickLog)}
	got := cardPicks("Goblin Bombardment", logs, map[int]string{31: "2025-08-31"})
	assert.Equal(t, []CardPick{{DraftID: 31, Date: "2025-08-31", Player: "Freddie", Pack: 1, Pick: 5}}, got)

	// A card nobody picked has no history.
	assert.Equal(t, []CardPick{}, cardPicks("Mayhem Devil", logs, nil))
}

func TestCardPicks_BadLogSkipped(t *testing.T) {
	logs := map[int]json.RawMessage{
		30: json.RawMessage(`{"users": "not a map"}`),
		31: json.RawMessage(pickLog),
	}
	got := cardPicks("Goblin Bombardment", logs, map[int]string{31: "2025-08-31"})
	assert.Len(t, got, 1)
}
