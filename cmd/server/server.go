package main

import (
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

func main() {
	// Register API handlers.
	http.Handle("/api/decks", server.DeckHandler())
	http.Handle("/api/archetypes", server.ArchetypesHandler())

	fmt.Println("Server listening on port 8888")
	err := http.ListenAndServe(":8888", nil)
	if err != nil {
		fmt.Println(err)
	}
}
