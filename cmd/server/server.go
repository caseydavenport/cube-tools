package main

import (
	"flag"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/importer"
	ocrhttp "github.com/caseydavenport/cube-tools/pkg/server/ocr"
	"github.com/caseydavenport/cube-tools/pkg/server/searchapi"
	"github.com/caseydavenport/cube-tools/pkg/server/stats"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/cubecobra"
	"github.com/caseydavenport/cube-tools/pkg/storage/file"
	"github.com/caseydavenport/cube-tools/pkg/storage/router"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func main() {
	readOnly := flag.Bool("read-only", false, "refuse every write, for a public read-only deployment")
	uiDir := flag.String("ui-dir", "", "serve the built UI from this directory; unset in dev, where webpack serves it")
	flag.Parse()

	// Deck hydration resolves card names against the oracle dataset. Without it
	// every card loads with no metadata, so refuse to start rather than serve
	// garbage.
	if types.OracleCardCount() == 0 {
		logrus.Fatal("no oracle card data loaded; run `make data/oracle-cards.json` to download it")
	}

	// Card roles (removal, counterspell and the rest) come from Scryfall's
	// oracle tags, so without them every role count reads zero.
	if types.OracleTagCount() == 0 {
		logrus.Fatal("no oracle tag data loaded; run `make data/oracle-tags.jsonl` to download it")
	}

	reg, err := cubes.Load("data/cubes.json")
	if err != nil {
		logrus.WithError(err).Fatal("failed to load cube registry")
	}

	// The provider serves cube lists live from Cube Cobra and is the CubeSource
	// every handler uses. Warm its cache up front; an outage at startup is only
	// a warning, and requests retry lazily.
	provider := commands.NewCubeProvider(reg)
	provider.Warm()

	mux := http.NewServeMux()
	mux.Handle("GET /api/cubes", server.CubesHandler(reg))
	mux.Handle("GET /api/search/check", searchapi.CheckHandler())
	mux.Handle("GET /api/search/keywords", searchapi.KeywordsHandler())
	mux.Handle("POST /api/search/highlight", searchapi.HighlightHandler())

	cubeRoute := func(pattern string, h http.Handler) {
		mux.Handle(pattern, server.WithCube(reg, h))
	}
	fileBackend := file.New(provider)
	ccBackend := cubecobra.New(commands.DefaultCubeCobraURL, provider)
	storeOpts := []storage.StoreOption{storage.WithPlayers(players.FileSource{DataRoot: "data"})}
	if *readOnly {
		logrus.Info("Serving read-only; every write is refused")
		storeOpts = append(storeOpts, storage.WithReadOnly())
	}
	deckStore := storage.NewStore(router.New(fileBackend, ccBackend), storeOpts...)

	// writeRoute is for handlers that write under data/<cube> directly rather
	// than through deckStore, so they need their own read-only check.
	writeRoute := func(pattern string, h http.Handler) {
		cubeRoute(pattern, server.RequireWritable(deckStore, h))
	}
	mux.Handle("GET /api/players", server.PlayersListHandler(deckStore))
	mux.Handle("POST /api/players", server.PlayerAddHandler(deckStore))
	mux.Handle("PATCH /api/players/{id}", server.PlayerUpdateHandler(deckStore))
	cubeRoute("GET /api/{cube}/cube", server.CubeContentHandler(provider))
	cubeRoute("GET /api/{cube}/info", server.CubeInfoHandler(deckStore))
	cubeRoute("GET /api/{cube}/index", server.CubeIndexHandler(deckStore))
	cubeRoute("GET /api/{cube}/drafts/{draft_id}/log", server.DraftLogHandler(deckStore))
	cubeRoute("GET /api/{cube}/decks", decks.DeckHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/decks/summary", decks.SummaryHandler(deckStore))
	cubeRoute("GET /api/{cube}/decks/similar", decks.SimilarDecksHandler(deckStore))
	cubeRoute("POST /api/{cube}/decks/update", decks.UpdateDeckHandler(deckStore))
	cubeRoute("POST /api/{cube}/decks/record", decks.UpdateDeckRecordHandler(deckStore))
	cubeRoute("GET /api/{cube}/archetypes", server.ArchetypesHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/cards", stats.CardStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/cards/search", stats.CardSearchHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/colors", stats.ColorStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/archetypes", stats.ArchetypeStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/archetype", stats.ArchetypePageHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/players", stats.PlayerStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/card", stats.CardPageHandler(deckStore, deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/card-compare", stats.CardCompareHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/cards/search", server.CardSearchHandler())
	cubeRoute("GET /api/{cube}/stats/color-matchups", stats.ColorMatchupHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/stats/pivot", stats.PivotHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/removal", stats.RemovalHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/tags", stats.TagsHandler(provider))
	cubeRoute("GET /api/{cube}/stats/design-graph", stats.DesignGraphHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/stats/design-graph/match", stats.DesignGraphMatchHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/group-distributions", stats.GroupDistributionsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/packages", stats.PackageStatsHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/package", stats.PackagePageHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/stats/group-check", stats.GroupCheckHandler(provider))
	cubeRoute("GET /api/{cube}/stats/link-check", stats.LinkCheckHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/rules-board", stats.RulesBoardHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/rule-groups", stats.RuleGroupsHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/stats/rules-preview", stats.RulesPreviewHandler(deckStore, provider))
	cubeRoute("GET /api/{cube}/stats/explorer", stats.ExplorerHandler(deckStore, provider, provider.Maybeboard))
	cubeRoute("GET /api/{cube}/stats/deck-charts", stats.DeckChartsHandler(deckStore, provider))
	cubeRoute("POST /api/{cube}/save-design-rules", stats.SaveDesignRulesHandler(deckStore))
	cubeRoute("GET /api/{cube}/package-overrides", stats.GetOverridesHandler(deckStore))
	cubeRoute("POST /api/{cube}/package-overrides", stats.SaveOverridesHandler(deckStore))
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
	writeRoute("POST /api/{cube}/import/commit", importer.CommitHandler(provider, deckStore))
	cubeRoute("POST /api/{cube}/import/check", importer.CheckHandler(provider))
	cubeRoute("GET /api/{cube}/import/hedron", importer.HedronListHandler())
	writeRoute("POST /api/{cube}/import/hedron", importer.HedronImportHandler(provider))
	writeRoute("POST /api/{cube}/import/photos", importer.PhotoImportHandler(provider))

	if *uiDir != "" {
		mux.Handle("GET /", http.FileServer(http.Dir(*uiDir)))
	}

	logrus.Info("Server listening on port 8888")
	if err := http.ListenAndServe(":8888", server.Gzip(mux)); err != nil {
		logrus.WithError(err).Fatal("server stopped")
	}
}
