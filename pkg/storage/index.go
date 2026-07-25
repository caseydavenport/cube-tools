package storage

// CubeIndex is the path-free view of a cube's drafts and their decks. It hides
// the on-disk index.json layout; identities are opaque, never filesystem paths.
type CubeIndex struct {
	Drafts []IndexedDraft `json:"drafts"`
}

// IndexedDraft is one draft in the index.
type IndexedDraft struct {
	DraftID string        `json:"draft_id"`
	Date    string        `json:"date"`
	HasLog  bool          `json:"has_log"`
	Decks   []IndexedDeck `json:"decks"`
}

// IndexedDeck names a deck within a draft by its opaque id.
type IndexedDeck struct {
	ID string `json:"id"`
}
