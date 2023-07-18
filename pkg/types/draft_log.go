package types

type DraftLog struct {
	Users    map[string]User      `json:"users"`
	CardData map[string]DraftCard `json:"carddata"`
}

type User struct {
	UserID   string   `json:"userID"`
	UserName string   `json:"userName"`
	Picks    []Pick   `json:"picks"`
	Decklist Decklist `json:"decklist"`
}

type Pick struct {
	PackNum int      `json:"packNum"`
	PickNum int      `json:"pickNum"`
	Pick    int      `json:"pick"`
	Booster []string `json:"booster"`
}

type DraftCard struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Decklist struct {
	Main []string `json:"main"`
	Side []string `json:"side"`
}

func (log *DraftLog) Card(n string) Card {
	card := Card{}
	draftCard := log.CardData[n]
	card.Name = draftCard.Name
	return card
}
