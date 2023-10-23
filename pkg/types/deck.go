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

	// Who built the deck.
	Player string `json:"player"`
	Date   string `json:"date"`

	// Performance data in terms of raw games won, lost, or tied.
	// Deprecated: Use the games field instead for new decks.
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	Ties   int `json:"ties"`

	// Games played with this deck.
	Games []Game `json:"games"`

	// Cards in the mainboard.
	Mainboard []Card `json:"mainboard"`
	Sideboard []Card `json:"sideboard"`
}

type Game struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
}
