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

	// ErrInvalidName is returned by Add and Rename for a name that is empty,
	// only digits, or a seat label.
	ErrInvalidName = errors.New("invalid player name")
)

// NoGroup is the play group of anonymous seats and players with no group, so
// every deck lands in exactly one group.
const NoGroup = "Everyone else"

// Player is one person in the list. ID is 1-based, never reused, and never
// changes; Name is what every page shows. Group is the player's play group,
// empty for none.
type Player struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Group string `json:"group,omitempty"`
}

// List is the contents of players.json.
type List struct {
	Players []Player `json:"players"`
}

// ByID returns the player with the given ID. A nil list has no players.
func (l *List) ByID(id int) (Player, bool) {
	if l == nil {
		return Player{}, false
	}
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

// validateName returns the trimmed name, or ErrInvalidName if it is empty,
// only digits (it would read as an ID), or a seat label like "p3" (it would
// read as an anonymous deck).
func validateName(name string) (string, error) {
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
	return update(dataRoot, func(l *List) (Player, error) { return l.Add(name) })
}

// Rename changes a player's display name. A change of case alone is allowed.
func Rename(dataRoot string, id int, name string) (Player, error) {
	return update(dataRoot, func(l *List) (Player, error) { return l.Rename(id, name) })
}

// SetGroup puts a player in a play group, or in none for an empty group.
// Naming NoGroup also means none. A group differing only in case from an
// existing one takes that group's spelling.
func SetGroup(dataRoot string, id int, group string) (Player, error) {
	return update(dataRoot, func(l *List) (Player, error) { return l.SetGroup(id, group) })
}

// update loads the list under dataRoot, applies change, and saves the result
// unless change fails, all while holding writeMu.
func update(dataRoot string, change func(*List) (Player, error)) (Player, error) {
	writeMu.Lock()
	defer writeMu.Unlock()
	l, err := Load(dataRoot)
	if err != nil {
		return Player{}, err
	}
	p, err := change(l)
	if err != nil {
		return Player{}, err
	}
	if err := save(dataRoot, l); err != nil {
		return Player{}, err
	}
	return p, nil
}

// Add appends a player with the next unused ID to the list and returns it.
func (l *List) Add(name string) (Player, error) {
	name, err := validateName(name)
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
	return p, nil
}

// Rename changes the display name of the player with the given ID. A change
// of case alone is allowed.
func (l *List) Rename(id int, name string) (Player, error) {
	name, err := validateName(name)
	if err != nil {
		return Player{}, err
	}
	if other, ok := l.ByName(name); ok && other.ID != id {
		return Player{}, fmt.Errorf("%w: %q", ErrNameTaken, name)
	}
	i := l.indexOf(id)
	if i < 0 {
		return Player{}, fmt.Errorf("%w: id %d", ErrUnknownPlayer, id)
	}
	l.Players[i].Name = name
	return l.Players[i], nil
}

// SetGroup puts the player with the given ID in a play group, following the
// same rules as the package-level SetGroup.
func (l *List) SetGroup(id int, group string) (Player, error) {
	group = strings.TrimSpace(group)
	if strings.EqualFold(group, NoGroup) {
		group = ""
	}
	for _, p := range l.Players {
		if p.Group != "" && strings.EqualFold(p.Group, group) {
			group = p.Group
			break
		}
	}
	i := l.indexOf(id)
	if i < 0 {
		return Player{}, fmt.Errorf("%w: id %d", ErrUnknownPlayer, id)
	}
	l.Players[i].Group = group
	return l.Players[i], nil
}

// indexOf returns the position of the player with the given ID, or -1.
func (l *List) indexOf(id int) int {
	for i, p := range l.Players {
		if p.ID == id {
			return i
		}
	}
	return -1
}

// GroupFor returns the play group of the player with the given ID, or NoGroup
// for an anonymous seat (zero) or a player in no group.
func (l *List) GroupFor(id int) string {
	if p, ok := l.ByID(id); ok && p.Group != "" {
		return p.Group
	}
	return NoGroup
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
