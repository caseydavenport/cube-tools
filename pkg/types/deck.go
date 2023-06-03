package types

func NewDeck() *Deck {
	return &Deck{
		Labels:    make([]string, 0),
		Mainboard: make([]Card, 0),
		Sideboard: make([]Card, 0),
	}
}

type Deck struct {
	// Tags represents metadata associated with this deck. This could be
	// archetype, playstyle, etc.
	Labels []string `json:"labels"`

	// Who build the deck.
	Player string

	// Performance data in terms of raw games won, lost, or tied.
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	Ties   int `json:"ties"`

	// Cards in the mainboard.
	Mainboard []Card `json:"mainboard"`
	Sideboard []Card `json:"sideboard"`
}
