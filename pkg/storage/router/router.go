package router

import (
	"encoding/json"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// FileBackend is the writable, registry-cube backend the router delegates to
// for everything that isn't a cc: cube.
type FileBackend interface {
	RawDecks(cube string) ([]*storage.Deck, error)
	Index(cube string) (*storage.CubeIndex, error)
	WriteDeckMeta(cube string, w storage.DeckMetaWrite) (*storage.Deck, error)
	GetNotes(cube, draftID, deckID string) (string, error)
	PutNotes(cube, draftID, deckID, content string) error
	GetRules(cube string) (*design.DesignMapConfig, error)
	PutRules(cube string, rules *design.DesignMapConfig) error
	GetDraftLog(cube, draftID string) (json.RawMessage, error)
}

// CCBackend is the read-only CubeCobra backend the router delegates to for cc:
// cubes.
type CCBackend interface {
	RawDecks(cube string) ([]*storage.Deck, error)
	Index(cube string) (*storage.CubeIndex, error)
}

// Router dispatches storage operations by cube id: cc: cubes go to the
// read-only CubeCobra backend, everything else to the file backend. It
// implements every storage capability interface; writes against a cc: cube
// return storage.ErrUnsupported.
type Router struct {
	file FileBackend
	cc   CCBackend
}

// baselineRulesCube is the registry cube whose design-map ruleset cc: cubes
// borrow. CubeCobra exposes no rules API, so serving this baseline gives cc:
// cubes a design map instead of nothing.
const baselineRulesCube = "polyverse"

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

func (r *Router) WriteDeckMeta(cube string, w storage.DeckMetaWrite) (*storage.Deck, error) {
	if cubes.IsCubeCobra(cube) {
		return nil, storage.ErrUnsupported
	}
	return r.file.WriteDeckMeta(cube, w)
}

func (r *Router) GetNotes(cube, draftID, deckID string) (string, error) {
	if cubes.IsCubeCobra(cube) {
		return "", storage.ErrUnsupported
	}
	return r.file.GetNotes(cube, draftID, deckID)
}

func (r *Router) PutNotes(cube, draftID, deckID, content string) error {
	if cubes.IsCubeCobra(cube) {
		return storage.ErrUnsupported
	}
	return r.file.PutNotes(cube, draftID, deckID, content)
}

func (r *Router) GetRules(cube string) (*design.DesignMapConfig, error) {
	if cubes.IsCubeCobra(cube) {
		return r.file.GetRules(baselineRulesCube)
	}
	return r.file.GetRules(cube)
}

func (r *Router) PutRules(cube string, rules *design.DesignMapConfig) error {
	if cubes.IsCubeCobra(cube) {
		return storage.ErrUnsupported
	}
	return r.file.PutRules(cube, rules)
}

func (r *Router) GetDraftLog(cube, draftID string) (json.RawMessage, error) {
	if cubes.IsCubeCobra(cube) {
		return nil, storage.ErrUnsupported
	}
	return r.file.GetDraftLog(cube, draftID)
}

var (
	_ storage.DeckBackend     = (*Router)(nil)
	_ storage.IndexBackend    = (*Router)(nil)
	_ storage.DeckMetaBackend = (*Router)(nil)
	_ storage.NotesBackend    = (*Router)(nil)
	_ storage.RulesBackend    = (*Router)(nil)
	_ storage.DraftLogBackend = (*Router)(nil)
)
