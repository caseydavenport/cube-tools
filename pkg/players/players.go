// Package players owns the global player list in <dataRoot>/players.json, each
// person with a stable ID and an editable name. Decks reference players by ID,
// so a rename touches only this file.
package players

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/sirupsen/logrus"
)

// Filename is the player list's file name within the data root.
const Filename = "players.json"

var (
	// ErrUnknownPlayer is returned when no player has the requested ID or name.
	ErrUnknownPlayer = errors.New("unknown player")

	// ErrNameTaken is returned when another player already has the name,
	// compared without case.
	ErrNameTaken = errors.New("another player already has that name")

	// ErrInvalidName is returned for a name ValidateName rejects.
	ErrInvalidName = errors.New("invalid player name")
)

// Player is one person in the list. ID is 1-based, never reused, and never
// changes; Name is what every page shows.
type Player struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// List is the contents of players.json.
type List struct {
	Players []Player `json:"players"`
}

// ByID returns the player with the given ID.
func (l *List) ByID(id int) (Player, bool) {
	for _, p := range l.Players {
		if p.ID == id {
			return p, true
		}
	}
	return Player{}, false
}

// ByName returns the player with the given name, ignoring case and
// surrounding space.
func (l *List) ByName(name string) (Player, bool) {
	name = strings.TrimSpace(name)
	for _, p := range l.Players {
		if strings.EqualFold(p.Name, name) {
			return p, true
		}
	}
	return Player{}, false
}

// Lookup resolves what a user typed on the command line: an all-digit ref is
// a player ID, anything else a name. It returns ErrUnknownPlayer, wrapped
// with the ref, when nothing matches.
func (l *List) Lookup(ref string) (Player, error) {
	if id, err := strconv.Atoi(strings.TrimSpace(ref)); err == nil {
		if p, ok := l.ByID(id); ok {
			return p, nil
		}
	} else if p, ok := l.ByName(ref); ok {
		return p, nil
	}
	return Player{}, fmt.Errorf("%w %q", ErrUnknownPlayer, ref)
}

// seatNameRE matches names that would read as an anonymous seat label.
var seatNameRE = regexp.MustCompile(`^[pP]\d+$`)

// digitsRE matches names that would read as a player ID.
var digitsRE = regexp.MustCompile(`^\d+$`)

// ValidateName returns the trimmed name, or ErrInvalidName if it is empty,
// only digits (it would read as an ID), or a seat label like "p3" (it would
// read as an anonymous deck).
func ValidateName(name string) (string, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", fmt.Errorf("%w: name is empty", ErrInvalidName)
	case digitsRE.MatchString(name):
		return "", fmt.Errorf("%w: %q is only digits", ErrInvalidName, name)
	case seatNameRE.MatchString(name):
		return "", fmt.Errorf("%w: %q looks like a seat label", ErrInvalidName, name)
	}
	return name, nil
}

// Load reads the player list under dataRoot. A missing file is an empty list.
func Load(dataRoot string) (*List, error) {
	bs, err := os.ReadFile(filepath.Join(dataRoot, Filename))
	if os.IsNotExist(err) {
		return &List{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read player list: %w", err)
	}
	l := &List{}
	if err := json.Unmarshal(bs, l); err != nil {
		return nil, fmt.Errorf("parse player list: %w", err)
	}
	return l, nil
}

// writeMu serializes read-modify-write cycles on the player list, so
// concurrent server requests can't pick the same ID or lose an update.
var writeMu sync.Mutex

// Add appends a player with the next unused ID and returns it.
func Add(dataRoot, name string) (Player, error) {
	name, err := ValidateName(name)
	if err != nil {
		return Player{}, err
	}
	writeMu.Lock()
	defer writeMu.Unlock()
	l, err := Load(dataRoot)
	if err != nil {
		return Player{}, err
	}
	if _, ok := l.ByName(name); ok {
		return Player{}, fmt.Errorf("%w: %q", ErrNameTaken, name)
	}
	highest := 0
	for _, p := range l.Players {
		highest = max(highest, p.ID)
	}
	p := Player{ID: highest + 1, Name: name}
	l.Players = append(l.Players, p)
	if err := save(dataRoot, l); err != nil {
		return Player{}, err
	}
	return p, nil
}

// Rename changes a player's display name. A change of case alone is allowed.
func Rename(dataRoot string, id int, name string) (Player, error) {
	name, err := ValidateName(name)
	if err != nil {
		return Player{}, err
	}
	writeMu.Lock()
	defer writeMu.Unlock()
	l, err := Load(dataRoot)
	if err != nil {
		return Player{}, err
	}
	if other, ok := l.ByName(name); ok && other.ID != id {
		return Player{}, fmt.Errorf("%w: %q", ErrNameTaken, name)
	}
	for i := range l.Players {
		if l.Players[i].ID == id {
			l.Players[i].Name = name
			if err := save(dataRoot, l); err != nil {
				return Player{}, err
			}
			return l.Players[i], nil
		}
	}
	return Player{}, fmt.Errorf("%w: id %d", ErrUnknownPlayer, id)
}

// save writes the list atomically: a temp file in dataRoot, then a rename over
// players.json, so a crash never leaves a half-written list.
func save(dataRoot string, l *List) error {
	bs, err := json.MarshalIndent(l, "", " ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dataRoot, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dataRoot, ".players-*.json")
	if err != nil {
		return fmt.Errorf("write player list: %w", err)
	}
	if _, err := tmp.Write(append(bs, '\n')); err != nil {
		if cerr := tmp.Close(); cerr != nil {
			logrus.WithError(cerr).Warn("Failed to close temp player list")
		}
		removeTemp(tmp.Name())
		return fmt.Errorf("write player list: %w", err)
	}
	if err := tmp.Close(); err != nil {
		removeTemp(tmp.Name())
		return fmt.Errorf("write player list: %w", err)
	}
	if err := os.Rename(tmp.Name(), filepath.Join(dataRoot, Filename)); err != nil {
		removeTemp(tmp.Name())
		return fmt.Errorf("write player list: %w", err)
	}
	return nil
}

// removeTemp deletes a temp file left by a failed save, logging if it can't.
func removeTemp(name string) {
	if err := os.Remove(name); err != nil {
		logrus.WithError(err).WithField("file", name).Warn("Failed to remove temp player list")
	}
}
