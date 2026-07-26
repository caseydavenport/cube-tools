package main

import (
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/importer"
	ocrhttp "github.com/caseydavenport/cube-tools/pkg/server/ocr"
	"github.com/caseydavenport/cube-tools/pkg/server/stats"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/cubecobra"
	"github.com/caseydavenport/cube-tools/pkg/storage/file"
	"github.com/caseydavenport/cube-tools/pkg/storage/router"
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

	// Cube lists now come live from Cube Cobra rather than files on disk. The
	// provider is the CubeSource injected into every handler that needs a cube.
	// Warm the cache up front; a CubeCobra outage at startup is a warning, not
	// fatal, and requests retry the fetch lazily.
	provider := commands.NewCubeProvider(reg)
	provider.Warm()

	mux := http.NewServeMux()
	mux.Handle("GET /api/cubes", server.CubesHandler(reg))

	cubeRoute := func(pattern string, h http.Handler) {
		mux.Handle(pattern, server.WithCube(reg, h))
	}
	fileBackend := file.New(provider)
	ccBackend := cubecobra.New(commands.DefaultCubeCobraURL, provider)
	deckStore := storage.NewStore(router.New(fileBackend, ccBackend))
	cubeRoute("GET /api/{cube}/cube", server.CubeContentHandler(provider))
	cubeRoute("GET /api/{cube}/index", server.CubeIndexHandler(deckStore))
	cubeRoute("GET /api/{cube}/drafts/{draft_id}/log", server.DraftLogHandler(deckStore))
	cubeRoute("GET /api/{cube}/notes", server.NotesHandler(deckStore))
	cubeRoute("GET /api/{cube}/decks", decks.DeckHandler(deckStore, func(cubeID string) ([]graph.Edge, error) {
		return stats.EdgesForCube(deckStore, provider, cubeID)
	}))
	cubeRoute("POST /api/{cube}/decks/update", decks.UpdateDeckHandler(deckStore))
	cubeRoute("GET /api/{cube}/archetypes", server.ArchetypesHandler(provider))
	cubeRoute("GET /api/{cube}/stats/cards", stats.CardStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/colors", stats.ColorStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/synergy", stats.SynergyStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/archetypes", stats.ArchetypeStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/players", stats.PlayerStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/color-matchups", stats.ColorMatchupHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/stats/pivot", stats.PivotHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/removal", stats.RemovalHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/health", stats.HealthStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/design-graph", stats.DesignGraphHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/stats/design-graph/match", stats.DesignGraphMatchHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/group-distributions", stats.GroupDistributionsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/packages", stats.PackageStatsHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/save-design-rules", stats.SaveDesignRulesHandler(deckStore))
	cubeRoute("POST /api/{cube}/save-notes", server.SaveNotesHandler(deckStore))
	cubeRoute("POST /api/{cube}/refresh", server.RefreshHandler(provider))

	// OCR draft-import endpoints. The detector is shared across requests; built
	// without `-tags ocr_cv` its calls return an error explaining the rebuild.
	// Cube lists resolve live from CubeCobra when no snapshot is on disk.
	det := ocrhttp.NewDetector()
	ocrhttp.SetCubeSource(provider)
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
	cubeRoute("GET /api/{cube}/import/cards", importer.ImportCardsHandler(provider))
	cubeRoute("POST /api/{cube}/import/parse", importer.ParseHandler(provider))
	cubeRoute("POST /api/{cube}/import/parse-dir", importer.ParseDirHandler(provider))
	cubeRoute("POST /api/{cube}/import/commit", importer.CommitHandler(provider))
	cubeRoute("POST /api/{cube}/import/check", importer.CheckHandler(provider))
	cubeRoute("GET /api/{cube}/import/hedron", importer.HedronListHandler())
	cubeRoute("POST /api/{cube}/import/hedron", importer.HedronImportHandler())
	cubeRoute("POST /api/{cube}/import/photos", importer.PhotoImportHandler())

	fmt.Println("Server listening on port 8888")
	if err := http.ListenAndServe(":8888", mux); err != nil {
		fmt.Println(err)
	}
}
