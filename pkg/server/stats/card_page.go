package stats

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// sameRoleLimit is how many same-role cards the card page lists.
const sameRoleLimit = 6

// CardPageResponse is everything the card page shows about one card. Play,
// the decks, who plays it, the record and picks follow the request's date
// range; History covers every draft. InCube says whether the current cube
// holds the card, and Copies how many copies it holds.
type CardPageResponse struct {
	Card        types.Card        `json:"card"`
	InCube      bool              `json:"in_cube"`
	Copies      int               `json:"copies"`
	Groups      []string          `json:"groups"`
	Play        CardPlay          `json:"play"`
	History     []DraftPresence   `json:"history"`
	Partners    []PackagePartners `json:"partners"`
	SameRole    []string          `json:"same_role"`
	Interaction CardInteraction   `json:"interaction"`
	DeckColors  []NamedCount      `json:"deck_colors"`
	Archetypes  []NamedCount      `json:"archetypes"`
	Players     []NamedCount      `json:"players"`
	Decks       []CardDeck        `json:"decks"`
	Record      Record            `json:"record"`
	Picks       []CardPick        `json:"picks"`

	// Connections are the package pairs a cube card joins through thin roles,
	// with how many cube cards each pair shares without it. Empty for a card
	// outside the cube.
	Connections []PackageConnection `json:"connections"`

	// PackageNames lists every package, sorted the way the Rules editor
	// sorts them, so the page colors each package the same way it does.
	PackageNames []string `json:"package_names"`
}

// CardCompareResponse lists the ways the rules link two cards.
type CardCompareResponse struct {
	Links []CardBridge `json:"links"`
}

// CardPageHandler serves the card page's data for the card named by the
// "name" query parameter, over the "start" and "end" date range. The app's
// deck filter is ignored: the page is about the card, not a slice of decks.
// logs supplies draft logs for pick history.
func CardPageHandler(store storage.DeckStorage, logs DraftLogReader, src types.CubeSource) http.Handler {
	return &cardPageHandler{q: newQuery(store, src), store: store, logs: logs, src: src}
}

type cardPageHandler struct {
	q     *deckquery.Query
	store storage.DeckStorage
	logs  DraftLogReader
	src   types.CubeSource
}

// ServeHTTP answers one card page request: 404 for a name neither the cube
// nor the oracle data knows, else the page's data as JSON.
func (h *cardPageHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cubeID := server.CubeFromRequest(r)
	name := query.GetString(r, "name")
	start := query.GetString(r, "start")
	end := query.GetString(r, "end")
	logrus.WithField("card", name).Info("/api/stats/card")

	rules, err := loadDesignInputs(h.store, h.src, cubeID)
	if err != nil {
		logrus.WithError(err).Error("could not load the cube for the card page")
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}
	card, inCube, ok := lookupCard(rules.cube, name)
	if !ok {
		http.Error(rw, "unknown card", http.StatusNotFound)
		return
	}

	// All decks feed the history; the ranged ones feed everything else.
	all, err := h.q.Decks(cubeID, &storage.DecksRequest{})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	ranged, err := h.q.Decks(cubeID, &storage.DecksRequest{Start: start, End: end})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	rules.config = rules.relevantConfig(rulebook.InAny(draftIDsOf(ranged)))
	page := cardPageInputs{
		card:   card,
		inCube: inCube,
		design: rules,
		all:    all,
		ranged: ranged,
		cubes:  cubeLists(rules.rb.DraftLists()),
		start:  start,
		end:    end,
		z:      zForConfidence(query.GetFloat(r, "confidence")),
	}
	resp := buildCardPage(page)
	resp.Picks = cardPicks(card.Name, h.readLogs(cubeID, resp.History), historyDates(resp.History))

	writeJSON(rw, resp, "card page")
}

// cardPageInputs is what the card page is built from: the card, whether the
// current cube holds it, the rules and cube, every deck and those in the date
// range, each draft's cube list, the range itself, and the interval's z.
type cardPageInputs struct {
	card   types.Card
	inCube bool
	design designInputs
	all    []*storage.Deck
	ranged []*storage.Deck
	cubes  cubeLists
	start  string
	end    string
	z      float64
}

// buildCardPage computes every section of the card page except pick history,
// which needs the draft logs.
func buildCardPage(page cardPageInputs) CardPageResponse {
	var extras []types.Card
	if !page.inCube {
		extras = append(extras, page.card)
	}
	relations := newCardRelations(page.design.cube, page.design.config, page.design.deckCardNames, extras)

	numMainboardsByCard := map[string]int{}
	for _, d := range page.ranged {
		for _, n := range nonBasicMainboard(d) {
			numMainboardsByCard[n]++
		}
	}

	history := draftHistory(page.card.Name, page.all, page.cubes, page.start, page.end)
	resp := CardPageResponse{
		Card:        page.card,
		InCube:      page.inCube,
		Copies:      rulebook.CountCards(page.design.cube.Cards)[page.card.Name],
		Groups:      relations.groupsOf(page.card.Name),
		Play:        cardPlay(page.card, page.ranged, history, page.design.cube),
		History:     history,
		Partners:    relations.partners(page.card.Name, numMainboardsByCard),
		SameRole:    relations.sameRole(page.card, sameRoleLimit),
		Interaction: cardInteraction(page.card, page.design.cube),
		Decks:       cardDecks(page.card.Name, page.ranged),
		Picks:       []CardPick{},
		Connections: cardConnections(page),

		PackageNames: packageNames(page.design.config.Packages),
	}
	resp.DeckColors, resp.Archetypes, resp.Players = whoPlays(page.card.Name, page.ranged)

	for _, d := range page.ranged {
		if deckPlays(d, page.card.Name) {
			resp.Record.Add(d)
		}
	}
	finishRecord(&resp.Record, page.z)
	return resp
}

// cardConnections scores a cube card the way the explorer does, at the
// default thin cutoff, for the package pairs it connects.
func cardConnections(page cardPageInputs) []PackageConnection {
	if !page.inCube {
		return []PackageConnection{}
	}
	hits := map[string]types.Card{page.card.Name: page.card}
	cards := exploreCards(hits, newExplorerRules(page.design.cube, page.design.config), defaultThin)
	return cards[0].Connections
}

// lookupCard finds a card by exact name in the cube, or else in the oracle
// data. It reports whether the cube holds it, and false for ok when neither
// knows the name.
func lookupCard(cube *types.Cube, name string) (types.Card, bool, bool) {
	for _, c := range cube.Cards {
		if c.Name == name {
			return c, true, true
		}
	}
	o := types.GetOracleData(name)
	if o.Name == "" {
		return types.Card{}, false, false
	}
	return types.FromOracle(o), false, true
}

// readLogs reads the draft logs of the drafts in the date range. Drafts
// without a log are skipped; other errors are logged and skipped.
func (h *cardPageHandler) readLogs(cubeID string, history []DraftPresence) map[int]json.RawMessage {
	logs := map[int]json.RawMessage{}
	for _, d := range history {
		if !d.InRange {
			continue
		}
		raw, err := h.logs.GetDraftLog(cubeID, d.DraftID)
		if err != nil {
			if !errors.Is(err, storage.ErrUnsupported) && !errors.Is(err, storage.ErrDeckNotFound) {
				logrus.WithError(err).WithField("draft", d.DraftID).Warn("could not read draft log")
			}
			continue
		}
		logs[d.DraftID] = raw
	}
	return logs
}

// historyDates maps each draft on a card's history to its date.
func historyDates(history []DraftPresence) map[int]string {
	dates := map[int]string{}
	for _, d := range history {
		dates[d.DraftID] = d.Date
	}
	return dates
}

// CardCompareHandler serves the ways the rules link the cards named by the
// "a" and "b" query parameters. A card outside the cube is resolved from the
// oracle data; an unknown name links to nothing.
func CardCompareHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cubeID := server.CubeFromRequest(r)
		rules, err := loadDesignInputs(store, src, cubeID)
		if err != nil {
			logrus.WithError(err).Error("could not load the cube for a card compare")
			http.Error(rw, "could not load cube", http.StatusInternalServerError)
			return
		}

		var extras []types.Card
		names := []string{query.GetString(r, "a"), query.GetString(r, "b")}
		for i, name := range names {
			card, inCube, ok := lookupCard(rules.cube, name)
			if !ok {
				writeJSON(rw, CardCompareResponse{Links: []CardBridge{}}, "card compare")
				return
			}
			names[i] = card.Name
			if !inCube {
				extras = append(extras, card)
			}
		}

		relations := newCardRelations(rules.cube, rules.relevantConfig(rulebook.Today), rules.deckCardNames, extras)
		writeJSON(rw, CardCompareResponse{Links: relations.linksBetween(names[0], names[1])}, "card compare")
	})
}

// writeJSON writes v as the JSON response, logging a failure to marshal or
// write under what.
func writeJSON(rw http.ResponseWriter, v any, what string) {
	b, err := json.Marshal(v)
	if err != nil {
		logrus.WithError(err).WithField("response", what).Error("could not marshal response")
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).WithField("response", what).Error("could not write response")
	}
}

// packageNames lists the packages' names, sorted ignoring case as the design
// graph sorts them.
func packageNames(packages []design.Package) []string {
	names := []string{}
	for _, p := range packages {
		names = append(names, p.Name)
	}
	slices.SortFunc(names, func(a, b string) int {
		return strings.Compare(strings.ToLower(a), strings.ToLower(b))
	})
	return names
}
