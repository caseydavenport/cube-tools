package storage

import "testing"

type readOnly struct{}

func (readOnly) RawDecks(string) ([]*Deck, error) { return nil, nil }

type readWrite struct{ readOnly }

func (readWrite) WriteDeckMeta(_, _, _, _ string, _, _ []string) (*Deck, error) { return nil, nil }

func TestDetect(t *testing.T) {
	if Detect(readOnly{}).WriteMeta {
		t.Fatal("read-only backend should not report WriteMeta")
	}
	if !Detect(readWrite{}).WriteMeta {
		t.Fatal("read-write backend should report WriteMeta")
	}
}
