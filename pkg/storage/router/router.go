package router

import (
	"encoding/json"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// FileBackend is the writable, registry-cube backend the router delegates to
// for everything that isn't a cc: cube.
type FileBackend interface {
	RawDecks(cube string) ([]*storage.Deck, error)
	Index(cube string) (*storage.CubeIndex, error)
	LoadDraft(cube string, draftID int) ([]*storage.Deck, error)
	SaveDecks(cube string, draftID int, decks []*storage.Deck) error
	GetRules(cube string) (*design.DesignMapConfig, error)
	PutRules(cube string, rules *design.DesignMapConfig) error
	GetOverrides(cube string) (design.PackageOverrides, error)
	PutOverrides(cube string, ov design.PackageOverrides) error
	GetDraftLog(cube string, draftID int) (json.RawMessage, error)
	GetSnapshot(cube string, draftID int) (*types.Cube, error)
}

// CCBackend is the read-only CubeCobra backend the router delegates to for cc:
// cubes.
type CCBackend interface {
	RawDecks(cube string) ([]*storage.Deck, error)
	Index(cube string) (*storage.CubeIndex, error)
}

// Router dispatches storage operations by cube id: cc: cubes go to the
// read-only CubeCobra backend, everything else to the file backend. Writes
// against a cc: cube return storage.ErrReadOnly.
type Router struct {
	file FileBackend
	cc   CCBackend
}

// baselineRulesCube is the rules directory cc: cubes read and write: the
// global rules every cube shares. CubeCobra exposes no rules API.
const baselineRulesCube = "global"

// New builds a router over a writable file backend and a read-only CubeCobra
// backend.
func New(file FileBackend, cc CCBackend) *Router {
	return &Router{file: file, cc: cc}
}

func (r *Router) RawDecks(cube string) ([]*storage.Deck, error) {
	if cubes.IsCubeCobra(cube) {
		return r.cc.RawDecks(cube)
	}
	return r.file.RawDecks(cube)
}

func (r *Router) Index(cube string) (*storage.CubeIndex, error) {
	if cubes.IsCubeCobra(cube) {
		return r.cc.Index(cube)
	}
	return r.file.Index(cube)
}

// LoadDraft returns a registry cube's draft from the file backend. CubeCobra
// cubes are read-only, so it returns ErrUnsupported for them.
func (r *Router) LoadDraft(cube string, draftID int) ([]*storage.Deck, error) {
	if cubes.IsCubeCobra(cube) {
		return nil, storage.ErrUnsupported
	}
	return r.file.LoadDraft(cube, draftID)
}

// SaveDecks writes a registry cube's decks through the file backend, returning
// ErrReadOnly for CubeCobra cubes.
func (r *Router) SaveDecks(cube string, draftID int, decks []*storage.Deck) error {
	if cubes.IsCubeCobra(cube) {
		return storage.ErrReadOnly
	}
	return r.file.SaveDecks(cube, draftID, decks)
}

func (r *Router) GetRules(cube string) (*design.DesignMapConfig, error) {
	if cubes.IsCubeCobra(cube) {
		return r.file.GetRules(baselineRulesCube)
	}
	return r.file.GetRules(cube)
}

// PutRules saves a cube's rules. A cc: cube's edits go to the global rules,
// which it reads.
func (r *Router) PutRules(cube string, rules *design.DesignMapConfig) error {
	if cubes.IsCubeCobra(cube) {
		return r.file.PutRules(baselineRulesCube, rules)
	}
	return r.file.PutRules(cube, rules)
}

// GetOverrides returns a registry cube's package overrides. CubeCobra cubes
// have none.
func (r *Router) GetOverrides(cube string) (design.PackageOverrides, error) {
	if cubes.IsCubeCobra(cube) {
		return design.PackageOverrides{}, nil
	}
	return r.file.GetOverrides(cube)
}

// PutOverrides saves a registry cube's package overrides, returning
// ErrReadOnly for CubeCobra cubes.
func (r *Router) PutOverrides(cube string, ov design.PackageOverrides) error {
	if cubes.IsCubeCobra(cube) {
		return storage.ErrReadOnly
	}
	return r.file.PutOverrides(cube, ov)
}

// GetSnapshot returns a draft's cube list from the file backend. Cube Cobra
// cubes keep no snapshots.
func (r *Router) GetSnapshot(cube string, draftID int) (*types.Cube, error) {
	if cubes.IsCubeCobra(cube) {
		return nil, storage.ErrUnsupported
	}
	return r.file.GetSnapshot(cube, draftID)
}

// GetDraftLog returns a draft's log from the file backend. Cube Cobra cubes
// keep no draft logs.
func (r *Router) GetDraftLog(cube string, draftID int) (json.RawMessage, error) {
	if cubes.IsCubeCobra(cube) {
		return nil, storage.ErrUnsupported
	}
	return r.file.GetDraftLog(cube, draftID)
}

// Writable reports whether the cube accepts writes: registry cubes do, and
// CubeCobra cubes don't.
func (r *Router) Writable(cube string) bool {
	return !cubes.IsCubeCobra(cube)
}

var _ storage.Backend = (*Router)(nil)
