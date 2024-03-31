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

	// Games played with this deck.
	Games []Game `json:"games"`

	// Legacy fields.
	Wins   int `json:"wins,omitempty"`
	Losses int `json:"losses,omitempty"`

	// Cards in the mainboard.
	Mainboard []Card `json:"mainboard"`
	Sideboard []Card `json:"sideboard"`
}

type Game struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
}

// RemoveGamesForOpponent removes all games against the given opponent from the deck.
func (d *Deck) RemoveGamesForOpponent(opponent string) {
	newGames := make([]Game, 0)
	for _, g := range d.Games {
		if g.Opponent != opponent {
			newGames = append(newGames, g)
		}
	}
	d.Games = newGames
}

// AddGame adds a game to the deck.
func (d *Deck) AddGame(opponent, winner string) {
	d.Games = append(d.Games, Game{Opponent: opponent, Winner: winner})
}
