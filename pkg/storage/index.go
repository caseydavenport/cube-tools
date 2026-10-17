package storage

// CubeIndex is the path-free view of a cube's drafts and their decks. It hides
// the on-disk index.json layout; identities are opaque, never filesystem paths.
type CubeIndex struct {
	Drafts []IndexedDraft `json:"drafts"`
}

// IndexedDraft is one draft in the index: its display fields, flattened into
// the JSON, plus whether it has a draft log and which decks it holds.
type IndexedDraft struct {
	DraftInfo
	HasLog bool          `json:"has_log"`
	Decks  []IndexedDeck `json:"decks"`
}

// IndexedDeck names a deck within a draft by its ID.
type IndexedDeck struct {
	ID int `json:"id"`
}
