package storage

import "github.com/caseydavenport/cube-tools/pkg/players"

// PlayerSource supplies the global player list Store resolves deck names
// against.
type PlayerSource interface {
	Players() (*players.List, error)
}

// StoreOption configures a Store at construction.
type StoreOption func(*Store)

// WithPlayers sets where Store gets the player list. Without it, decks with a
// player ID show a placeholder name and anonymous decks their seat label.
func WithPlayers(ps PlayerSource) StoreOption {
	return func(s *Store) { s.players = ps }
}
