package types

// Basic representation of a card.
type Card struct {
	Name  string   `json:"name"`
	Types []string `json:"types,omitempty"`
}
