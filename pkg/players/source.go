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
