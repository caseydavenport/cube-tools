package players

// FileSource loads the player list from DataRoot on every call, so a rename
// is visible as soon as the file changes.
type FileSource struct {
	DataRoot string
}

// Players reads the list from disk.
func (s FileSource) Players() (*List, error) {
	return Load(s.DataRoot)
}

// StaticSource serves a fixed list, for tests and in-memory stores.
type StaticSource struct {
	List *List
}

// Players returns the fixed list.
func (s StaticSource) Players() (*List, error) {
	return s.List, nil
}
