package main

import (
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/importer"
	ocrhttp "github.com/caseydavenport/cube-tools/pkg/server/ocr"
	"github.com/caseydavenport/cube-tools/pkg/server/stats"
	"github.com/caseydavenport/cube-tools/pkg/storage"
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
	deckStore := storage.NewFileDeckStore()
	cubeRoute("GET /api/{cube}/decks", decks.DeckHandler(deckStore))
	cubeRoute("POST /api/{cube}/decks/update", decks.UpdateDeckHandler(deckStore))
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
	cubeRoute("POST /api/{cube}/refresh", server.RefreshHandler(reg))

	// OCR draft-import endpoints. The detector is shared across requests; built
	// without `-tags ocr_cv` its calls return an error explaining the rebuild.
	det := ocrhttp.NewDetector()
	cubeRoute("GET /api/{cube}/img/{path...}", ocrhttp.ImageHandler())
	cubeRoute("GET /api/{cube}/ocr/drafts", ocrhttp.DraftsHandler())
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}", ocrhttp.DraftDetailHandler())
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/cards", ocrhttp.CardsHandler())
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/consistency", ocrhttp.ConsistencyHandler())
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/session", ocrhttp.SessionGetHandler())
	cubeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/session", ocrhttp.SessionSaveHandler())
	cubeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/players/{player}/confirm", ocrhttp.ConfirmHandler())
	cubeRoute("POST /api/{cube}/ocr/detect", ocrhttp.DetectHandler(det))
	cubeRoute("POST /api/{cube}/ocr/region", ocrhttp.RegionHandler(det))
	cubeRoute("POST /api/{cube}/ocr/rotate", ocrhttp.RotateHandler())
	cubeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/scan", ocrhttp.ScanStartHandler(det))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/scan", ocrhttp.ScanStatusHandler())

	// Text and Hedron import endpoints.
	cubeRoute("GET /api/{cube}/import/cards", importer.ImportCardsHandler())
	cubeRoute("POST /api/{cube}/import/parse", importer.ParseHandler())
	cubeRoute("POST /api/{cube}/import/parse-dir", importer.ParseDirHandler())
	cubeRoute("POST /api/{cube}/import/commit", importer.CommitHandler())
	cubeRoute("POST /api/{cube}/import/check", importer.CheckHandler())
	cubeRoute("GET /api/{cube}/import/hedron", importer.HedronListHandler())
	cubeRoute("POST /api/{cube}/import/hedron", importer.HedronImportHandler())

	fmt.Println("Server listening on port 8888")
	if err := http.ListenAndServe(":8888", mux); err != nil {
		fmt.Println(err)
	}
}
