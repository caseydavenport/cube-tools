package main

import (
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/stats"
)

func main() {
	// Register API handlers.
	http.Handle("/api/decks", decks.DeckHandler())
	http.Handle("/api/archetypes", server.ArchetypesHandler())
	http.Handle("/api/stats/cards", stats.CardStatsHandler())
	http.Handle("/api/stats/colors", stats.ColorStatsHandler())
	http.Handle("/api/stats/synergy", stats.SynergyStatsHandler())
	http.Handle("/api/stats/archetypes", stats.ArchetypeStatsHandler())
	http.Handle("/api/stats/players", stats.PlayerStatsHandler())

	fmt.Println("Server listening on port 8888")
	err := http.ListenAndServe(":8888", nil)
	if err != nil {
		fmt.Println(err)
	}
}
