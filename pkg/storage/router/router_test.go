package router

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fakeFile is the file backend stub. It records which cube each call named and
// whether any write reached it.
type fakeFile struct {
	wrote         bool
	rulesCube     string
	putRulesCube  string
	overridesCube string
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

func (f *fakeFile) Index(cube string) (*storage.CubeIndex, error) {
	return &storage.CubeIndex{}, nil
}

func (f *fakeFile) LoadDraft(cube string, draftID int) ([]*storage.Deck, error) {
	return []*storage.Deck{deckFor("file:" + cube)}, nil
}

func (f *fakeFile) SaveDecks(cube string, draftID int, decks []*storage.Deck) error {
	f.wrote = true
	return nil
}

func (f *fakeFile) CreateDraft(string, types.DraftMetadata, *types.Cube, []*storage.Deck) (int, error) {
	f.wrote = true
	return 1, nil
}

func (f *fakeFile) GetRules(cube string) (*design.DesignMapConfig, error) {
	f.rulesCube = cube
	return &design.DesignMapConfig{}, nil
}

func (f *fakeFile) PutRules(cube string, r *design.DesignMapConfig) error {
	f.wrote = true
	f.putRulesCube = cube
	return nil
}

func (f *fakeFile) GetOverrides(cube string) (design.PackageOverrides, error) {
	f.overridesCube = cube
	return design.PackageOverrides{On: []string{"from file"}}, nil
}

func (f *fakeFile) PutOverrides(cube string, ov design.PackageOverrides) error {
	f.wrote = true
	return nil
}

func (f *fakeFile) GetDraftLog(cube string, d int) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}

func (f *fakeFile) GetSnapshot(cube string, d int) (*types.Cube, error) {
	return &types.Cube{}, nil
}

// fakeCC is the CubeCobra backend stub.
type fakeCC struct{}

func (fakeCC) RawDecks(cube string) ([]*storage.Deck, error) {
	return []*storage.Deck{deckFor("cc:" + cube)}, nil
}

func (fakeCC) Index(cube string) (*storage.CubeIndex, error) {
	return &storage.CubeIndex{}, nil
}

func TestRouterReadDispatch(t *testing.T) {
	router := New(&fakeFile{}, fakeCC{})
	fileDecks, err := router.RawDecks("polyverse")
	if err != nil || len(fileDecks) != 1 || fileDecks[0].Player != "file:polyverse" {
		t.Errorf("registry cube routed to %v, %v, want the file backend's deck", fileDecks, err)
	}
	ccDecks, err := router.RawDecks("cc:polyversal")
	if err != nil || len(ccDecks) != 1 || ccDecks[0].Player != "cc:cc:polyversal" {
		t.Errorf("cc cube routed to %v, %v, want the cc backend's deck", ccDecks, err)
	}
}

func TestRouterWritesGatedForCC(t *testing.T) {
	files := &fakeFile{}
	router := New(files, fakeCC{})

	if err := router.SaveDecks("polyverse", 1, nil); err != nil {
		t.Fatalf("registry write errored: %v", err)
	}
	if !files.wrote {
		t.Error("registry write did not reach file backend")
	}
	if _, err := router.LoadDraft("polyverse", 1); err != nil {
		t.Fatalf("registry LoadDraft errored: %v", err)
	}

	if err := router.SaveDecks("cc:polyversal", 1, nil); !errors.Is(err, storage.ErrReadOnly) {
		t.Errorf("cc SaveDecks err = %v, want ErrReadOnly", err)
	}
	if _, err := router.LoadDraft("cc:polyversal", 1); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc LoadDraft err = %v, want ErrUnsupported", err)
	}
	if _, err := router.GetDraftLog("cc:polyversal", 1); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc GetDraftLog err = %v, want ErrUnsupported", err)
	}
}

func TestRouterCreateDraftGatedForCC(t *testing.T) {
	files := &fakeFile{}
	router := New(files, fakeCC{})
	if _, err := router.CreateDraft("cc:polyversal", types.DraftMetadata{}, nil, nil); !errors.Is(err, storage.ErrReadOnly) {
		t.Errorf("cc CreateDraft err = %v, want ErrReadOnly", err)
	}
	if files.wrote {
		t.Error("cc CreateDraft reached the file backend")
	}
	if _, err := router.CreateDraft("polyverse", types.DraftMetadata{}, nil, nil); err != nil {
		t.Fatalf("registry CreateDraft errored: %v", err)
	}
	if !files.wrote {
		t.Error("registry CreateDraft did not reach file backend")
	}
}

func TestRouter_RulesCubeChoice(t *testing.T) {
	files := &fakeFile{}
	router := New(files, fakeCC{})
	if _, err := router.GetRules("cc:polyversal"); err != nil {
		t.Fatalf("cc GetRules errored: %v", err)
	}
	if files.rulesCube != "global" {
		t.Errorf("cc GetRules read %q, want global", files.rulesCube)
	}
	if err := router.PutRules("cc:polyversal", &design.DesignMapConfig{}); err != nil {
		t.Fatalf("cc PutRules errored: %v", err)
	}
	if files.putRulesCube != "global" {
		t.Errorf("cc PutRules wrote %q, want global", files.putRulesCube)
	}

	if _, err := router.GetRules("polyverse"); err != nil {
		t.Fatalf("registry GetRules errored: %v", err)
	}
	if files.rulesCube != "polyverse" {
		t.Errorf("registry GetRules read %q, want polyverse", files.rulesCube)
	}
	if err := router.PutRules("polyverse", &design.DesignMapConfig{}); err != nil {
		t.Fatalf("registry PutRules errored: %v", err)
	}
	if files.putRulesCube != "polyverse" {
		t.Errorf("registry PutRules wrote %q, want polyverse", files.putRulesCube)
	}
}

func TestRouter_CCOverridesUnsupported(t *testing.T) {
	files := &fakeFile{}
	router := New(files, fakeCC{})
	got, err := router.GetOverrides("cc:polyversal")
	if err != nil {
		t.Fatalf("cc GetOverrides errored: %v", err)
	}
	if len(got.On) != 0 || files.overridesCube != "" {
		t.Errorf("cc GetOverrides = %v from %q, want empty without the file backend", got, files.overridesCube)
	}
	if err := router.PutOverrides("cc:polyversal", design.PackageOverrides{}); !errors.Is(err, storage.ErrReadOnly) {
		t.Errorf("cc PutOverrides err = %v, want ErrReadOnly", err)
	}
	if files.wrote {
		t.Error("cc PutOverrides reached the file backend")
	}

	reg, err := router.GetOverrides("polyverse")
	if err != nil || files.overridesCube != "polyverse" || len(reg.On) != 1 {
		t.Errorf("registry GetOverrides = %v, %v from %q, want the file backend's", reg, err, files.overridesCube)
	}
}

func TestRouterWritable(t *testing.T) {
	router := New(&fakeFile{}, fakeCC{})
	if !router.Writable("polyverse") {
		t.Error("registry cube should be writable")
	}
	if router.Writable("cc:polyversal") {
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
