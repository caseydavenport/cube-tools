package storage

// Capabilities describes the optional operations a backend supports. It is
// derived from the backend's implemented interfaces, never hand-maintained.
type Capabilities struct {
	WriteDecks bool
	Rules      bool
}

// Detect reports which optional capabilities a backend implements.
func Detect(backend any) Capabilities {
	_, writeDecks := backend.(DraftBackend)
	_, rules := backend.(RulesBackend)
	return Capabilities{WriteDecks: writeDecks, Rules: rules}
}
