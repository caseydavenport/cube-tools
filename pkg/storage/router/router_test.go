package router

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
)

type fakeFile struct {
	wrote     bool
	rulesCube string
}

// deckFor builds a deck whose player names the backend and cube it came from,
// so dispatch tests can tell which backend answered.
func deckFor(source string) *storage.Deck {
	d := &storage.Deck{}
	d.Player = source
	return d
}

func (f *fakeFile) RawDecks(cube string) ([]*storage.Deck, error) {
	return []*storage.Deck{deckFor("file:" + cube)}, nil
}
func (f *fakeFile) Index(cube string) (*storage.CubeIndex, error) { return &storage.CubeIndex{}, nil }
func (f *fakeFile) LoadDraft(cube string, draftID int) ([]*storage.Deck, error) {
	return []*storage.Deck{deckFor("file:" + cube)}, nil
}

func (f *fakeFile) SaveDecks(cube string, draftID int, decks []*storage.Deck) error {
	f.wrote = true
	return nil
}

func (f *fakeFile) GetRules(cube string) (*design.DesignMapConfig, error) {
	f.rulesCube = cube
	return &design.DesignMapConfig{}, nil
}
func (f *fakeFile) PutRules(cube string, r *design.DesignMapConfig) error { f.wrote = true; return nil }
func (f *fakeFile) GetDraftLog(cube string, d int) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}

type fakeCC struct{}

func (fakeCC) RawDecks(cube string) ([]*storage.Deck, error) {
	return []*storage.Deck{deckFor("cc:" + cube)}, nil
}
func (fakeCC) Index(cube string) (*storage.CubeIndex, error) { return &storage.CubeIndex{}, nil }

func TestRouterReadDispatch(t *testing.T) {
	r := New(&fakeFile{}, fakeCC{})
	fd, _ := r.RawDecks("polyverse")
	if fd[0].Player != "file:polyverse" {
		t.Errorf("registry cube routed to %q, want file", fd[0].Player)
	}
	cd, _ := r.RawDecks("cc:polyversal")
	if cd[0].Player != "cc:cc:polyversal" {
		t.Errorf("cc cube routed to %q, want cc backend", cd[0].Player)
	}
}

func TestRouterWritesGatedForCC(t *testing.T) {
	ff := &fakeFile{}
	r := New(ff, fakeCC{})

	if err := r.SaveDecks("polyverse", 1, nil); err != nil {
		t.Fatalf("registry write errored: %v", err)
	}
	if !ff.wrote {
		t.Error("registry write did not reach file backend")
	}
	if _, err := r.LoadDraft("polyverse", 1); err != nil {
		t.Fatalf("registry LoadDraft errored: %v", err)
	}

	if err := r.SaveDecks("cc:polyversal", 1, nil); !errors.Is(err, storage.ErrReadOnly) {
		t.Errorf("cc SaveDecks err = %v, want ErrReadOnly", err)
	}
	if _, err := r.LoadDraft("cc:polyversal", 1); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc LoadDraft err = %v, want ErrUnsupported", err)
	}
	if err := r.PutRules("cc:polyversal", &design.DesignMapConfig{}); !errors.Is(err, storage.ErrReadOnly) {
		t.Errorf("cc PutRules err = %v, want ErrReadOnly", err)
	}
	if _, err := r.GetDraftLog("cc:polyversal", 1); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc GetDraftLog err = %v, want ErrUnsupported", err)
	}
}

func TestRouterCCRulesBaseline(t *testing.T) {
	ff := &fakeFile{}
	r := New(ff, fakeCC{})
	if _, err := r.GetRules("cc:polyversal"); err != nil {
		t.Fatalf("cc GetRules errored: %v", err)
	}
	if ff.rulesCube != baselineRulesCube {
		t.Errorf("cc GetRules read rules for %q, want baseline %q", ff.rulesCube, baselineRulesCube)
	}
}

func TestRouterWritable(t *testing.T) {
	r := New(&fakeFile{}, fakeCC{})
	if !r.Writable("polyverse") {
		t.Error("registry cube should be writable")
	}
	if r.Writable("cc:polyversal") {
		t.Error("cc cube should be read-only")
	}
}

// TestRouterConformance runs the storage contract through the router, with the
// memory backend standing in for files and a CubeCobra stub for cc: cubes.
func TestRouterConformance(t *testing.T) {
	mem := memory.New()
	memory.SeedConformance(mem)
	s := storage.NewStore(New(mem, fakeCC{}), storage.WithPlayers(mem))
	storage.RunConformance(t, s, "cc:conf")
}
