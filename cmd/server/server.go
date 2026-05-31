package main

import (
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/stats"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

func main() {
	// Deck hydration resolves card names against the oracle dataset. Without it
	// every card loads with no metadata, so refuse to start rather than serve
	// garbage.
	if types.OracleCardCount() == 0 {
		logrus.Fatal("no oracle card data loaded; run `make data/oracle-cards.json` to download it")
	}

	reg, err := cubes.Load("data/cubes.json")
	if err != nil {
		logrus.WithError(err).Fatal("failed to load cube registry")
	}

	mux := http.NewServeMux()
	mux.Handle("GET /api/cubes", server.CubesHandler(reg))

	cubeRoute := func(pattern string, h http.Handler) {
		mux.Handle(pattern, server.WithCube(reg, h))
	}
	cubeRoute("GET /api/{cube}/cube", server.CubeContentHandler())
	cubeRoute("GET /api/{cube}/index", server.CubeIndexHandler())
	cubeRoute("GET /api/{cube}/drafts/{draft_id}/log", server.DraftLogHandler())
	cubeRoute("GET /api/{cube}/notes", server.NotesHandler())
	cubeRoute("GET /api/{cube}/decks", decks.DeckHandler())
	cubeRoute("GET /api/{cube}/archetypes", server.ArchetypesHandler())
	cubeRoute("GET /api/{cube}/stats/cards", stats.CardStatsHandler())
	cubeRoute("GET /api/{cube}/stats/colors", stats.ColorStatsHandler())
	cubeRoute("GET /api/{cube}/stats/synergy", stats.SynergyStatsHandler())
	cubeRoute("GET /api/{cube}/stats/archetypes", stats.ArchetypeStatsHandler())
	cubeRoute("GET /api/{cube}/stats/players", stats.PlayerStatsHandler())
	cubeRoute("GET /api/{cube}/stats/color-matchups", stats.ColorMatchupHandler())
	cubeRoute("GET /api/{cube}/stats/health", stats.HealthStatsHandler())
	cubeRoute("GET /api/{cube}/stats/design-graph", stats.DesignGraphHandler())
	cubeRoute("POST /api/{cube}/stats/design-graph/match", stats.DesignGraphMatchHandler())
	cubeRoute("POST /api/{cube}/save-design-rules", stats.SaveDesignRulesHandler())
	cubeRoute("POST /api/{cube}/save-notes", server.SaveNotesHandler())

	fmt.Println("Server listening on port 8888")
	if err := http.ListenAndServe(":8888", mux); err != nil {
		fmt.Println(err)
	}
}
