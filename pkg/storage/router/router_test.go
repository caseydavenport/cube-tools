package router

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

type fakeFile struct{ wrote bool }

func (f *fakeFile) RawDecks(cube string) ([]*storage.Deck, error) {
	return []*storage.Deck{{ID: "file:" + cube}}, nil
}
func (f *fakeFile) Index(cube string) (*storage.CubeIndex, error) { return &storage.CubeIndex{}, nil }
func (f *fakeFile) WriteDeckMeta(cube, d, id, m string, l, c []string) (*storage.Deck, error) {
	f.wrote = true
	return &storage.Deck{ID: id}, nil
}
func (f *fakeFile) GetNotes(cube, d, id string) (string, error) { return "notes", nil }
func (f *fakeFile) PutNotes(cube, d, id, content string) error  { f.wrote = true; return nil }
func (f *fakeFile) GetRules(cube string) (*design.DesignMapConfig, error) {
	return &design.DesignMapConfig{}, nil
}
func (f *fakeFile) PutRules(cube string, r *design.DesignMapConfig) error { f.wrote = true; return nil }
func (f *fakeFile) GetDraftLog(cube, d string) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}

type fakeCC struct{}

func (fakeCC) RawDecks(cube string) ([]*storage.Deck, error) {
	return []*storage.Deck{{ID: "cc:" + cube}}, nil
}
func (fakeCC) Index(cube string) (*storage.CubeIndex, error) { return &storage.CubeIndex{}, nil }

func TestRouterReadDispatch(t *testing.T) {
	r := New(&fakeFile{}, fakeCC{})
	fd, _ := r.RawDecks("polyverse")
	if fd[0].ID != "file:polyverse" {
		t.Errorf("registry cube routed to %q, want file", fd[0].ID)
	}
	cd, _ := r.RawDecks("cc:polyversal")
	if cd[0].ID != "cc:cc:polyversal" {
		t.Errorf("cc cube routed to %q, want cc backend", cd[0].ID)
	}
}

func TestRouterWritesGatedForCC(t *testing.T) {
	ff := &fakeFile{}
	r := New(ff, fakeCC{})

	if _, err := r.WriteDeckMeta("polyverse", "d", "id", "m", nil, nil); err != nil {
		t.Fatalf("registry write errored: %v", err)
	}
	if !ff.wrote {
		t.Error("registry write did not reach file backend")
	}

	if _, err := r.WriteDeckMeta("cc:polyversal", "d", "id", "m", nil, nil); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc WriteDeckMeta err = %v, want ErrUnsupported", err)
	}
	if err := r.PutNotes("cc:polyversal", "d", "id", "x"); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc PutNotes err = %v, want ErrUnsupported", err)
	}
	if err := r.PutRules("cc:polyversal", &design.DesignMapConfig{}); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc PutRules err = %v, want ErrUnsupported", err)
	}
	if _, err := r.GetNotes("cc:polyversal", "d", "id"); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc GetNotes err = %v, want ErrUnsupported", err)
	}
	if _, err := r.GetRules("cc:polyversal"); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc GetRules err = %v, want ErrUnsupported", err)
	}
	if _, err := r.GetDraftLog("cc:polyversal", "d"); !errors.Is(err, storage.ErrUnsupported) {
		t.Errorf("cc GetDraftLog err = %v, want ErrUnsupported", err)
	}
}
