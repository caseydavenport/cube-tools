package storage

import "github.com/caseydavenport/cube-tools/pkg/players"

// PlayerSource supplies the global player list Store resolves deck names
// against.
type PlayerSource interface {
	Players() (*players.List, error)
}

// PlayerStore is a PlayerSource that can also change the list. Store routes
// player edits through it when its source implements it.
type PlayerStore interface {
	PlayerSource
	AddPlayer(name string) (players.Player, error)
	RenamePlayer(id int, name string) (players.Player, error)
	SetPlayerGroup(id int, group string) (players.Player, error)
}

var _ PlayerStore = players.FileSource{}

// StoreOption configures a Store at construction.
type StoreOption func(*Store)

// WithPlayers sets where Store gets the player list. Without it, decks with a
// player ID show a placeholder name and anonymous decks their seat label.
func WithPlayers(ps PlayerSource) StoreOption {
	return func(s *Store) { s.players = ps }
}

// WithReadOnly makes the Store refuse every write, whatever the backend
// allows: deck edits, rules, overrides, new drafts and player edits.
func WithReadOnly() StoreOption {
	return func(s *Store) { s.readOnly = true }
}
