package storage

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
)

type readOnly struct{}

func (readOnly) RawDecks(string) ([]*Deck, error) { return nil, nil }

type readWrite struct{ readOnly }

func (readWrite) WriteDeckMeta(_, _, _, _ string, _, _ []string) (*Deck, error) { return nil, nil }

type notesBackend struct{ readOnly }

func (notesBackend) GetNotes(_, _, _ string) (string, error) { return "", nil }
func (notesBackend) PutNotes(_, _, _, _ string) error        { return nil }

type rulesBackend struct{ readOnly }

func (rulesBackend) GetRules(string) (*design.DesignMapConfig, error) { return nil, nil }
func (rulesBackend) PutRules(string, *design.DesignMapConfig) error   { return nil }

func TestDetect(t *testing.T) {
	if Detect(readOnly{}).WriteMeta {
		t.Fatal("read-only backend should not report WriteMeta")
	}
	if !Detect(readWrite{}).WriteMeta {
		t.Fatal("read-write backend should report WriteMeta")
	}
	if Detect(readOnly{}).Notes {
		t.Fatal("read-only backend should not report Notes")
	}
	if !Detect(notesBackend{}).Notes {
		t.Fatal("notes backend should report Notes")
	}
	if Detect(readOnly{}).Rules {
		t.Fatal("read-only backend should not report Rules")
	}
	if !Detect(rulesBackend{}).Rules {
		t.Fatal("rules backend should report Rules")
	}
}
