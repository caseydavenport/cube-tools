package storage

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
)

type readOnly struct{}

func (readOnly) RawDecks(string) ([]*Deck, error) { return nil, nil }

type readWrite struct{ readOnly }

func (readWrite) LoadDraft(_ string, _ int) ([]*Deck, error) {
	return nil, nil
}

func (readWrite) SaveDecks(_ string, _ int, _ []*Deck) error {
	return nil
}

type rulesBackend struct{ readOnly }

func (rulesBackend) GetRules(string) (*design.DesignMapConfig, error) { return nil, nil }
func (rulesBackend) PutRules(string, *design.DesignMapConfig) error   { return nil }

func TestDetect(t *testing.T) {
	if Detect(readOnly{}).WriteDecks {
		t.Fatal("read-only backend should not report WriteDecks")
	}
	if !Detect(readWrite{}).WriteDecks {
		t.Fatal("read-write backend should report WriteDecks")
	}
	if Detect(readOnly{}).Rules {
		t.Fatal("read-only backend should not report Rules")
	}
	if !Detect(rulesBackend{}).Rules {
		t.Fatal("rules backend should report Rules")
	}
}
