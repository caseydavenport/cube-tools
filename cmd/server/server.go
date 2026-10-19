package main

import (
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/players"
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
	deckStore := storage.NewStore(router.New(fileBackend, ccBackend), storage.WithPlayers(players.FileSource{DataRoot: "data"}))

	// writeRoute is for handlers that write under data/<cube> directly rather
	// than through deckStore, so they need their own read-only check.
	writeRoute := func(pattern string, h http.Handler) {
		cubeRoute(pattern, server.RequireWritable(deckStore, h))
	}
	edgesFor := func(cubeID string) ([]graph.Edge, error) {
		return stats.EdgesForCube(deckStore, provider, cubeID)
	}
	mux.Handle("GET /api/players", server.PlayersListHandler("data"))
	mux.Handle("POST /api/players", server.PlayerAddHandler("data"))
	mux.Handle("PATCH /api/players/{id}", server.PlayerRenameHandler("data", deckStore))
	cubeRoute("GET /api/{cube}/cube", server.CubeContentHandler(provider))
	cubeRoute("GET /api/{cube}/info", server.CubeInfoHandler(deckStore))
	cubeRoute("GET /api/{cube}/index", server.CubeIndexHandler(deckStore))
	cubeRoute("GET /api/{cube}/drafts/{draft_id}/log", server.DraftLogHandler(deckStore))
	cubeRoute("GET /api/{cube}/decks", decks.DeckHandler(deckStore, edgesFor))
	cubeRoute("POST /api/{cube}/decks/update", decks.UpdateDeckHandler(deckStore))
	cubeRoute("POST /api/{cube}/decks/record", decks.UpdateDeckRecordHandler(deckStore))
	cubeRoute("GET /api/{cube}/archetypes", server.ArchetypesHandler(deckStore, edgesFor))
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
	cubeRoute("POST /api/{cube}/refresh", server.RefreshHandler(provider))

	// OCR draft-import endpoints. The detector is shared across requests; built
	// without `-tags ocr_cv` its calls return an error explaining the rebuild.
	// Cube lists resolve live from CubeCobra when no snapshot is on disk.
	det := ocrhttp.NewDetector()
	ocrhttp.SetCubeSource(provider)
	cubeRoute("GET /api/{cube}/ocr/drafts", ocrhttp.DraftsHandler("data"))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}", ocrhttp.DraftDetailHandler("data"))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/cards", ocrhttp.CardsHandler("data"))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/consistency", ocrhttp.ConsistencyHandler("data"))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/session", ocrhttp.SessionGetHandler("data"))
	writeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/session", ocrhttp.SessionSaveHandler("data"))
	writeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/players/{player}/confirm", ocrhttp.ConfirmHandler("data"))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/img/{path...}", ocrhttp.ImageHandler("data"))
	cubeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/detect", ocrhttp.DetectHandler(det, "data"))
	cubeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/region", ocrhttp.RegionHandler(det, "data"))
	writeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/rotate", ocrhttp.RotateHandler("data"))
	writeRoute("POST /api/{cube}/ocr/drafts/{draft_id}/scan", ocrhttp.ScanStartHandler(det, "data"))
	cubeRoute("GET /api/{cube}/ocr/drafts/{draft_id}/scan", ocrhttp.ScanStatusHandler("data"))

	// Text and Hedron import endpoints.
	cubeRoute("GET /api/{cube}/import/cards", importer.ImportCardsHandler(provider))
	cubeRoute("POST /api/{cube}/import/parse", importer.ParseHandler(provider))
	cubeRoute("POST /api/{cube}/import/parse-dir", importer.ParseDirHandler(provider))
	writeRoute("POST /api/{cube}/import/commit", importer.CommitHandler(provider, "data"))
	cubeRoute("POST /api/{cube}/import/check", importer.CheckHandler(provider))
	cubeRoute("GET /api/{cube}/import/hedron", importer.HedronListHandler())
	writeRoute("POST /api/{cube}/import/hedron", importer.HedronImportHandler())
	writeRoute("POST /api/{cube}/import/photos", importer.PhotoImportHandler())

	fmt.Println("Server listening on port 8888")
	if err := http.ListenAndServe(":8888", server.Gzip(mux)); err != nil {
		fmt.Println(err)
	}
}
