package storage

// Capabilities describes the optional operations a backend supports. It is
// derived from the backend's implemented interfaces, never hand-maintained.
type Capabilities struct {
	WriteMeta bool
}

// Detect reports which optional capabilities a backend implements.
func Detect(backend any) Capabilities {
	_, writeMeta := backend.(DeckMetaBackend)
	return Capabilities{WriteMeta: writeMeta}
}
