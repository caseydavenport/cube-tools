package types

// DraftLog is a draft exported from the draft site, as parsed from its JSON.
// Users maps a user ID to that drafter, and CardData maps a card ID to the
// card it names.
type DraftLog struct {
	Users    map[string]User      `json:"users"`
	CardData map[string]DraftCard `json:"carddata"`
}

// User is one drafter in a DraftLog, with their picks and the decklist they
// built.
type User struct {
	UserID   string   `json:"userID"`
	UserName string   `json:"userName"`
	Picks    []Pick   `json:"picks"`
	Decklist Decklist `json:"decklist"`
}

// Pick is one pick in a DraftLog: the booster offered, as card IDs, and the
// index into it of the card taken.
type Pick struct {
	PackNum int      `json:"packNum"`
	PickNum int      `json:"pickNum"`
	Pick    int      `json:"pick"`
	Booster []string `json:"booster"`
}

// DraftCard is a card as a DraftLog names it. The log's picks and decklists
// refer to it by ID.
type DraftCard struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Decklist is the card IDs a drafter put in their mainboard and sideboard.
type Decklist struct {
	Main []string `json:"main"`
	Side []string `json:"side"`
}

// Card returns a Card holding only the name of the log's card with the given
// ID. The name is empty when the log has no such card.
func (l *DraftLog) Card(cardID string) Card {
	return Card{Name: l.CardData[cardID].Name}
}
