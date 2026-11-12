package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// frozenBackend fronts the backend of a read-only Store. Nothing changes the
// data short of a restart, so each read reaches the backend once and is then
// served from memory, which matters when the data dir is a bucket mount.
// Callers share the returned values and must not modify them.
type frozenBackend struct {
	Backend
	mu   sync.Mutex
	memo map[string]memoEntry
}

type memoEntry struct {
	value any
	err   error
}

func newFrozenBackend(b Backend) *frozenBackend {
	return &frozenBackend{Backend: b, memo: map[string]memoEntry{}}
}

// remember returns the stored result for key, or calls load and stores it.
// Only lasting answers are stored: success or a definite "not there".
func remember[T any](mu *sync.Mutex, memo map[string]memoEntry, key string, load func() (T, error)) (T, error) {
	mu.Lock()
	e, ok := memo[key]
	mu.Unlock()
	if ok {
		v, _ := e.value.(T)
		return v, e.err
	}
	v, err := load()
	if err == nil || errors.Is(err, ErrDeckNotFound) || errors.Is(err, ErrUnsupported) || errors.Is(err, os.ErrNotExist) {
		mu.Lock()
		memo[key] = memoEntry{value: v, err: err}
		mu.Unlock()
	}
	return v, err
}

func (f *frozenBackend) Index(cube string) (*CubeIndex, error) {
	return remember(&f.mu, f.memo, "index/"+cube, func() (*CubeIndex, error) { return f.Backend.Index(cube) })
}

func (f *frozenBackend) GetRules(cube string) (*design.DesignMapConfig, error) {
	return remember(&f.mu, f.memo, "rules/"+cube, func() (*design.DesignMapConfig, error) { return f.Backend.GetRules(cube) })
}

func (f *frozenBackend) GetOverrides(cube string) (design.PackageOverrides, error) {
	return remember(&f.mu, f.memo, "overrides/"+cube, func() (design.PackageOverrides, error) { return f.Backend.GetOverrides(cube) })
}

func (f *frozenBackend) GetSnapshot(cube string, draftID int) (*types.Cube, error) {
	key := fmt.Sprintf("snapshot/%s/%d", cube, draftID)
	return remember(&f.mu, f.memo, key, func() (*types.Cube, error) { return f.Backend.GetSnapshot(cube, draftID) })
}

func (f *frozenBackend) GetDraftLog(cube string, draftID int) (json.RawMessage, error) {
	key := fmt.Sprintf("log/%s/%d", cube, draftID)
	return remember(&f.mu, f.memo, key, func() (json.RawMessage, error) { return f.Backend.GetDraftLog(cube, draftID) })
}

// frozenPlayers reads the player list once, for a read-only Store.
type frozenPlayers struct {
	PlayerSource
	mu   sync.Mutex
	memo map[string]memoEntry
}

func (f *frozenPlayers) Players() (*players.List, error) {
	return remember(&f.mu, f.memo, "players", f.PlayerSource.Players)
}
