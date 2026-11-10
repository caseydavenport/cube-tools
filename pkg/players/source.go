package players

// FileSource loads the player list from DataRoot on every call, so a rename
// is visible as soon as the file changes. Its writes go straight to the file.
type FileSource struct {
	DataRoot string
}

// Players reads the list from disk.
func (s FileSource) Players() (*List, error) {
	return Load(s.DataRoot)
}

// AddPlayer adds a player to the list on disk.
func (s FileSource) AddPlayer(name string) (Player, error) {
	return Add(s.DataRoot, name)
}

// RenamePlayer renames a player in the list on disk.
func (s FileSource) RenamePlayer(id int, name string) (Player, error) {
	return Rename(s.DataRoot, id, name)
}

// SetPlayerGroup sets a player's play group in the list on disk.
func (s FileSource) SetPlayerGroup(id int, group string) (Player, error) {
	return SetGroup(s.DataRoot, id, group)
}
