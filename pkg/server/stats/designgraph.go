package stats

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

const cardRefPrefix = "card:"

// cardRefName returns the card name for a "card:" wire entry, or "" if the
// entry is a group name.
func cardRefName(entry string) string {
	name, ok := strings.CutPrefix(entry, cardRefPrefix)
	if !ok {
		return ""
	}
	return name
}

// DesignGraphResponse is the API response for /api/stats/design-graph.
type DesignGraphResponse struct {
	Nodes    []DesignGraphNode `json:"nodes"`
	Edges    []DesignGraphEdge `json:"edges"`
	Groups   []design.Group    `json:"groups"`
	Packages []design.Package  `json:"packages"`

	// GroupNodes is the aggregated group-level node set, where each node is a group
	// rather than a card. The UI toggles between this and the card-level graph.
	GroupNodes []DesignGraphGroupNode `json:"group_nodes"`

	// GroupEdges connect groups based on actual card-level connections: two groups
	// are joined when a card in one is connected to a card in the other.
	GroupEdges []DesignGraphGroupEdge `json:"group_edges"`

	// PackageEdges connect groups based on the package definitions directly,
	// mirroring how the packages wire groups together regardless of card membership.
	PackageEdges []DesignGraphGroupEdge `json:"package_edges"`
}

// DesignGraphNode represents a card in the design graph, with metadata and connection count.
type DesignGraphNode struct {
	// Name is the card name, serving as the unique identifier for the node.
	Name string `json:"name"`

	// Colors is the list of color symbols for the card (e.g., ["R"], ["U", "B"], or [] for colorless).
	Colors []string `json:"colors"`

	// Types is the list of type and subtype strings for the card (e.g., ["Creature", "Human", "Soldier"]).
	Types []string `json:"types"`

	// CMC is the converted mana cost of the card.
	CMC int `json:"cmc"`

	// ConnectionCount is the number of edges connected to this node in the design graph.
	ConnectionCount int `json:"connection_count"`
}

type DesignGraphEdge struct {
	// Source and Target are card names.
	Source string `json:"source"`
	Target string `json:"target"`

	// Weight is the number of packages that connect these two cards.
	Weight int `json:"weight"`

	// Packages names the packages that connect the source and target cards,
	// derived from the groups they belong to.
	Packages []string `json:"packages"`
}

// DesignGraphGroupNode represents a group in the aggregated group-level graph.
type DesignGraphGroupNode struct {
	// Name is the group name, serving as the unique identifier for the node.
	Name string `json:"name"`

	// Kind distinguishes regular groups from "card:" wire references, which
	// appear in the group graph as single-card pseudo-groups.
	Kind string `json:"kind"`

	// CardCount is the number of cards matching the group's conditions.
	CardCount int `json:"card_count"`

	// Cards is the sorted list of card names in the group, so the UI can list
	// members when the group is selected. Connection counts are view-specific
	// (card-derived vs. package-derived), so the client computes node degree from
	// whichever edge set is active rather than baking it in here.
	Cards []string `json:"cards"`

	// ExcludedCards lists cards that matched the group's conditions but were
	// carved out by the group's exclude list, so the editor can show them
	// greyed with a restore action.
	ExcludedCards []string `json:"excluded_cards,omitempty"`
}

// DesignGraphGroupEdge represents a connection between two groups in the group-level graph.
type DesignGraphGroupEdge struct {
	// Source and Target are group names.
	Source string `json:"source"`
	Target string `json:"target"`

	// Weight is the number of distinct card-pairs this group connection represents,
	// so thicker edges mean denser interaction between the two groups.
	Weight int `json:"weight"`

	// Packages names the packages that connect the two groups.
	Packages []string `json:"packages"`
}

func DesignGraphHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		logrus.Info("/api/stats/design-graph")

		cubeID := server.CubeFromRequest(r)

		// A rules file that can't be read is an error, never an empty rule set:
		// the editor saves what it loads, over every cube's shared rules.
		in, err := loadDesignInputs(store, src, cubeID)
		if err != nil {
			logrus.WithError(err).Error("could not load the cube or its rules")
			http.Error(rw, "could not load the cube or its rules", http.StatusInternalServerError)
			return
		}

		// The decks page asks for one deck's draft, so its links show only
		// packages that draft's list supported. Rules editors ask for all.
		config := in.config
		if draft := query.GetString(r, "draft"); draft != "" {
			draftID, err := strconv.Atoi(draft)
			if err != nil {
				http.Error(rw, "draft must be a number", http.StatusBadRequest)
				return
			}
			config = in.relevantConfig(relevantInDraft(draftID))
		}

		resp := buildDesignGraph(in.cube, config, in.deckCardNames)

		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
}

// DesignGraphForCube builds the design graph from a cube's catalog and rules,
// same builder as /api/stats/design-graph. Unlike the handler, a missing or
// malformed cube-rules.json is a hard error, not an empty-config fallback, so a
// caller fails loudly rather than getting an edgeless graph - except when the
// store reports ErrUnsupported (only test stores do), which is treated as an
// empty config. Paths
// resolve from the working directory, so run from the repo root.
func DesignGraphForCube(store storage.DeckStorage, src types.CubeSource, cubeID string) (DesignGraphResponse, error) {
	in, err := loadDesignInputs(store, src, cubeID)
	if err != nil {
		return DesignGraphResponse{}, err
	}
	return buildDesignGraph(in.cube, in.config, in.deckCardNames), nil
}

// PackagesForCube resolves a cube's packages to card names, ready to test
// which decks build each one, with each package's relevance attached. It
// loads the same rules and cards as DesignGraphForCube and fails the same way.
func PackagesForCube(store storage.DeckStorage, src types.CubeSource, cubeID string) ([]design.PackageCards, error) {
	in, err := loadDesignInputs(store, src, cubeID)
	if err != nil {
		return nil, err
	}
	return in.packages(), nil
}

// designInputs is what the design graph and package detection are built from:
// the current cube list, its rules, the cards its decks have played and its
// drafts' lists held, every list packages are judged against, and the
// packages the cube forces on or off.
type designInputs struct {
	cube          *types.Cube
	config        design.DesignMapConfig
	deckCardNames []string
	lists         cardLists
	overrides     design.PackageOverrides
}

// packages resolves the rules' packages with their relevance attached.
func (in designInputs) packages() []design.PackageCards {
	return in.packagesWith(in.config)
}

// packagesWith resolves another config's packages against the same cube,
// decks and lists, such as a proposed edit to the rules.
func (in designInputs) packagesWith(config design.DesignMapConfig) []design.PackageCards {
	pkgs := resolvePackages(in.cube, config, in.deckCardNames)
	attachRelevance(pkgs, in.lists, in.overrides)
	return pkgs
}

// loadDesignInputs loads a cube's list, rules, deck card names, card lists
// and overrides. A store without rules support gives an empty config; a
// failure to list decks or read overrides is logged, since it only loses cut
// cards or forced packages.
func loadDesignInputs(store storage.DeckStorage, src types.CubeSource, cubeID string) (designInputs, error) {
	cube, err := src.Current(cubeID)
	if err != nil {
		return designInputs{}, err
	}
	cfg, err := store.GetRules(cubeID)
	var config design.DesignMapConfig
	if errors.Is(err, storage.ErrUnsupported) {
		config = design.DesignMapConfig{}
	} else if err != nil {
		return designInputs{}, err
	} else {
		config = *cfg
	}
	decks, err := store.List(cubeID, &storage.DecksRequest{})
	if err != nil {
		logrus.WithError(err).Warn("could not load decks; cut cards may show disconnected")
	}
	lists := loadCardLists(store, cubeID, cube, decks)
	overrides, err := store.GetOverrides(cubeID)
	if err != nil {
		logrus.WithError(err).Warn("could not read package overrides; none applied")
	}
	names := append(distinctCardNames(decks), lists.snapshotOnlyNames()...)
	return designInputs{cube: cube, config: config, deckCardNames: names, lists: lists, overrides: overrides}, nil
}

// deckCardNames returns the distinct non-basic mainboard card names across all of
// a cube's decks. The design graph uses these to widen its edge set so cards cut
// from the cube still resolve group membership and stay connected on old decks.
func deckCardNames(store storage.DeckStorage, cubeID string) ([]string, error) {
	decks, err := store.List(cubeID, &storage.DecksRequest{})
	if err != nil {
		return nil, err
	}
	return distinctCardNames(decks), nil
}

// distinctCardNames returns the distinct non-basic mainboard card names
// across the decks.
func distinctCardNames(decks []*storage.Deck) []string {
	seen := make(map[string]bool)
	var names []string
	for _, d := range decks {
		for _, name := range nonBasicMainboard(d) {
			if seen[name] {
				continue
			}
			seen[name] = true
			names = append(names, name)
		}
	}
	return names
}

// MatchedCard describes a card and which conditions it matched.
type MatchedCard struct {
	Name       string             `json:"name"`
	Conditions []MatchedCondition `json:"conditions"`
}

// MatchedCondition records a condition string and optionally which group it came from.
type MatchedCondition struct {
	Condition string `json:"condition"`
	Group     string `json:"group,omitempty"`

	// Excluded means the condition matched, but the owning group's exclude
	// list carves this card out - the card is not an effective member via
	// this condition.
	Excluded bool `json:"excluded,omitempty"`
}

// DesignGraphMatchRequest is the request body for /api/stats/design-graph/match, containing conditions and groups to match against.
type DesignGraphMatchRequest struct {
	Conditions []string `json:"conditions"`
	Groups     []string `json:"groups"`
}

type DesignGraphMatchResponse struct {
	Cards []MatchedCard `json:"cards"`
}

// DesignGraphMatchHandler handles POST /api/stats/design-graph/match.
// It accepts {"conditions": ["o:mill", ...], "groups": ["GroupA", ...]} and returns
// matching cards with per-card condition info.
func DesignGraphMatchHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req DesignGraphMatchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		cubeID := server.CubeFromRequest(r)
		cube, err := src.Current(cubeID)
		if err != nil {
			http.Error(rw, "could not load cube", http.StatusInternalServerError)
			return
		}

		// Build a map of card name to card data for efficient lookups, excluding basic lands.
		cardMap := buildCardMap(cube)

		// Saved rules supply the per-group exclude lists so matches can be
		// marked. Missing rules just means nothing gets marked excluded.
		var config design.DesignMapConfig
		if cfg, err := store.GetRules(cubeID); err != nil {
			logrus.WithError(err).Debug("could not load cube rules for match")
			config = design.DesignMapConfig{}
		} else {
			config = *cfg
		}

		resp := DesignGraphMatchResponse{Cards: matchConditions(cardMap, config, req)}
		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
}

// matchConditions evaluates each request condition against the card map and
// returns the per-card breakdown, sorted by name. A condition whose owning
// group excludes the card is marked rather than dropped, so the editor can
// show the card greyed instead of silently losing it.
func matchConditions(cardMap map[string]types.Card, config design.DesignMapConfig, req DesignGraphMatchRequest) []MatchedCard {
	excludes := make(map[string]map[string]bool)
	for _, g := range config.Groups {
		if len(g.Exclude) == 0 {
			continue
		}
		set := make(map[string]bool, len(g.Exclude))
		for _, name := range g.Exclude {
			set[name] = true
		}
		excludes[g.Name] = set
	}

	cardConditions := make(map[string][]MatchedCondition)
	for i, cond := range req.Conditions {
		group := ""
		if i < len(req.Groups) {
			group = req.Groups[i]
		}
		for name := range matchCards(cardMap, cond) {
			cardConditions[name] = append(cardConditions[name], MatchedCondition{
				Condition: cond,
				Group:     group,
				Excluded:  excludes[group][name],
			})
		}
	}

	cards := make([]MatchedCard, 0, len(cardConditions))
	for name, conds := range cardConditions {
		cards = append(cards, MatchedCard{Name: name, Conditions: conds})
	}
	slices.SortFunc(cards, func(a, b MatchedCard) int {
		return strings.Compare(a.Name, b.Name)
	})
	return cards
}

// GroupDistribution reports, for one design-map group, how many of the group's
// cards each deck runs. The client ranks a deck's groups by where its count
// falls in this distribution, so the widget surfaces the strategies a deck
// over-indexes on rather than whatever groups are simply largest in the cube.
type GroupDistribution struct {
	Name string `json:"name"`

	// Cards is the group's effective membership, so the client can count the
	// current deck without also fetching the design graph.
	Cards []string `json:"cards"`

	// DeckCounts holds one entry per deck: the number of the group's cards in
	// that deck's mainboard. Unordered; the client derives percentiles from it.
	DeckCounts []int `json:"deck_counts"`

	// Manabase marks groups that are almost entirely lands (fetches, duals,
	// basics). Running extra fixing isn't a strategy, so the client hides these.
	Manabase bool `json:"manabase"`
}

// GroupDistributionsResponse is the API response for /api/{cube}/stats/group-distributions.
type GroupDistributionsResponse struct {
	DeckCount int                 `json:"deck_count"`
	Groups    []GroupDistribution `json:"groups"`
}

// A deck needs at least this many mainboard cards to feed the distribution.
// Below it the deck is a pool-only record (games but no built decklist) whose
// zero counts would skew every group's percentiles downward.
const distributionMinDeckSize = 20

// manabaseLandFraction is the share of a group's cards that must be lands for it
// to read as manabase plumbing rather than a strategy.
const manabaseLandFraction = 0.8

func GroupDistributionsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &groupDistributionsHandler{store: store, q: newQuery(store, src)}
}

type groupDistributionsHandler struct {
	store storage.DeckStorage
	q     *deckquery.Query
}

func (h *groupDistributionsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	logrus.Info("/api/stats/group-distributions")

	cubeID := server.CubeFromRequest(r)
	cube, err := h.q.Cube(cubeID)
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}

	var config design.DesignMapConfig
	if cfg, err := h.store.GetRules(cubeID); err != nil {
		logrus.WithError(err).Warn("could not load cube rules")
		config = design.DesignMapConfig{}
	} else {
		config = *cfg
	}

	allDecks, err := h.q.Decks(cubeID, &storage.DecksRequest{})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := groupDistributions(cube, config, allDecks)
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write group distributions response")
	}
}

// groupDistributions counts each group's cards in every deck's mainboard. Only
// decks with a real mainboard contribute, so the percentiles the client derives
// aren't diluted by pool-only records.
func groupDistributions(cube *types.Cube, config design.DesignMapConfig, decks []*storage.Deck) GroupDistributionsResponse {
	cardMap := buildCardMap(cube)
	groupCards, _ := resolveGroupCards(cardMap, config.Groups)

	mainboards := make([]map[string]bool, 0, len(decks))
	for _, d := range decks {
		mb := d.GetMainboard()
		if len(mb) < distributionMinDeckSize {
			continue
		}
		names := make(map[string]bool, len(mb))
		for _, c := range mb {
			names[c.Name] = true
		}
		mainboards = append(mainboards, names)
	}

	groups := make([]GroupDistribution, 0, len(config.Groups))
	for _, g := range config.Groups {
		members := groupCards[g.Name]
		if len(members) == 0 {
			continue
		}

		cards := make([]string, 0, len(members))
		lands := 0
		for name := range members {
			cards = append(cards, name)

			// cardMap excludes basic lands, so a basic won't be found here - but
			// basics never match group conditions anyway, so it can't skew the
			// land fraction.
			if c, ok := cardMap[name]; ok && c.IsLand() {
				lands++
			}
		}
		slices.Sort(cards)

		counts := make([]int, len(mainboards))
		for i, names := range mainboards {
			for name := range members {
				if names[name] {
					counts[i]++
				}
			}
		}

		groups = append(groups, GroupDistribution{
			Name:       g.Name,
			Cards:      cards,
			DeckCounts: counts,
			Manabase:   float64(lands)/float64(len(members)) >= manabaseLandFraction,
		})
	}

	return GroupDistributionsResponse{DeckCount: len(mainboards), Groups: groups}
}

// buildCardMap creates a name->card lookup from a cube, excluding basic lands
// and enriching multi-face cards with oracle data.
func buildCardMap(cube *types.Cube) map[string]types.Card {
	cardMap := make(map[string]types.Card)
	for _, c := range cube.Cards {
		if c.IsBasicLand() {
			continue
		}
		if c.OracleText == "" {
			o := types.GetOracleData(c.Name)
			if o.Name != "" {
				enriched := types.FromOracle(o)
				c.OracleText = enriched.OracleText
			}
		}
		cardMap[c.Name] = c
	}
	return cardMap
}

// resolveGroupCards resolves each group's conditions to its effective member set
// with the group's exclude list subtracted, returning the members per group and
// the carved-out names per group (which the editor shows greyed).
func resolveGroupCards(cardMap map[string]types.Card, groups []design.Group) (map[string]map[string]bool, map[string][]string) {
	groupCards := make(map[string]map[string]bool, len(groups))
	excluded := make(map[string][]string)
	for _, g := range groups {
		cards := make(map[string]bool)
		for _, cond := range g.Conditions {
			for name := range matchCards(cardMap, cond) {
				cards[name] = true
			}
		}
		for _, name := range g.Exclude {
			if cards[name] {
				delete(cards, name)
				excluded[g.Name] = append(excluded[g.Name], name)
			}
		}
		slices.Sort(excluded[g.Name])
		groupCards[g.Name] = cards
	}
	return groupCards, excluded
}

// GroupCards returns each group's matching card names from cards, after its
// Exclude list. It's for tools that score rules outside the server, so they
// match cards exactly as the app does.
func GroupCards(cards map[string]types.Card, groups []design.Group) map[string]map[string]bool {
	groupCards, _ := resolveGroupCards(cards, groups)
	return groupCards
}

// widenWithDeckCards returns cardMap plus any deck-referenced cards not in the
// cube, hydrated from oracle data. It returns cardMap unchanged when there's
// nothing to add, so callers can detect widening by comparing lengths.
func widenWithDeckCards(cardMap map[string]types.Card, deckCardNames []string) map[string]types.Card {
	var missing []string
	for _, name := range deckCardNames {
		if _, ok := cardMap[name]; !ok {
			missing = append(missing, name)
		}
	}
	if len(missing) == 0 {
		return cardMap
	}

	widened := make(map[string]types.Card, len(cardMap)+len(missing))
	for name, c := range cardMap {
		widened[name] = c
	}
	for _, name := range missing {
		o := types.GetOracleData(name)
		if o.Name == "" {
			continue
		}
		c := types.FromOracle(o)
		if c.IsBasicLand() {
			continue
		}
		widened[name] = c
	}

	if len(widened) == len(cardMap) {
		return cardMap
	}
	return widened
}

// registerCardRefs adds each wire's card references as single-card pseudo-groups,
// keyed by the raw wire entry, so the wire and group-graph loops need no special
// case for a card named directly in a package. An unknown card (typo, or cut from
// the cube) resolves empty, same as a dangling group name.
func registerCardRefs(packages []design.Package, cardMap map[string]types.Card, groupCards map[string]map[string]bool) {
	for _, pkg := range packages {
		for _, wire := range pkg.Wires {
			for _, entry := range slices.Concat(wire.Sources, wire.Targets) {
				name := cardRefName(entry)
				if name == "" {
					continue
				}
				cards := make(map[string]bool)
				if _, ok := cardMap[name]; ok {
					cards[name] = true
				}
				groupCards[entry] = cards
			}
		}
	}
}

// wireSide returns every card in the named groups and card: entries of one
// side of a wire.
func wireSide(groupCards map[string]map[string]bool, entries []string) map[string]bool {
	out := make(map[string]bool)
	for _, entry := range entries {
		for name := range groupCards[entry] {
			out[name] = true
		}
	}
	return out
}

// withoutBasics returns the side's cards minus basic lands, which never count
// toward building a package.
func withoutBasics(side map[string]bool) map[string]bool {
	out := make(map[string]bool, len(side))
	for name := range side {
		if !types.IsBasic(name) {
			out[name] = true
		}
	}
	return out
}

// buildCardEdges creates one undirected edge per pair of cards joined by a
// package, stamped with every package that joins them.
func buildCardEdges(packages []design.Package, groupCards map[string]map[string]bool) []DesignGraphEdge {
	type edgeKey struct{ source, target string }
	edgePackages := make(map[edgeKey]map[string]bool)

	for _, pkg := range packages {
		for _, wire := range pkg.Wires {
			sources := wireSide(groupCards, wire.Sources)
			targets := wireSide(groupCards, wire.Targets)

			for s := range sources {
				for t := range targets {
					if s == t {
						continue
					}
					// Normalize edge direction so (A,B) and (B,A) are the same edge.
					a, b := s, t
					if a > b {
						a, b = b, a
					}
					k := edgeKey{a, b}
					if edgePackages[k] == nil {
						edgePackages[k] = make(map[string]bool)
					}
					edgePackages[k][pkg.Name] = true
				}
			}
		}
	}

	var edges []DesignGraphEdge
	for k, nameSet := range edgePackages {
		names := make([]string, 0, len(nameSet))
		for n := range nameSet {
			names = append(names, n)
		}
		slices.Sort(names)
		edges = append(edges, DesignGraphEdge{
			Source:   k.source,
			Target:   k.target,
			Weight:   len(names),
			Packages: names,
		})
	}
	return edges
}

// resolvedGroups holds every group and card: entry resolved to card names.
// cube covers the cube list alone; widened adds cards cut from the cube that
// old decks still play, so those decks keep their edges and packages.
// excluded lists the matches each group's exclude list carved out.
type resolvedGroups struct {
	cube     map[string]map[string]bool
	widened  map[string]map[string]bool
	excluded map[string][]string
}

// resolveGroups resolves the rules' groups and card: entries over the cube and
// over the cube plus the cards decks have played. Excluded cards are already
// subtracted, so nothing downstream sees them.
func resolveGroups(cardMap map[string]types.Card, config design.DesignMapConfig, deckCardNames []string) resolvedGroups {
	groupCards, groupExcluded := resolveGroupCards(cardMap, config.Groups)
	registerCardRefs(config.Packages, cardMap, groupCards)

	widened := groupCards
	edgeCardMap := widenWithDeckCards(cardMap, deckCardNames)
	if len(edgeCardMap) != len(cardMap) {
		widened, _ = resolveGroupCards(edgeCardMap, config.Groups)
		registerCardRefs(config.Packages, edgeCardMap, widened)
	}
	return resolvedGroups{cube: groupCards, widened: widened, excluded: groupExcluded}
}

// resolvePackages turns each package's wires into card sets, sorted by
// package name. A side holds the cards decks may play, cut cards included;
// how many of them a deck needs comes from sideNeed, and which can carry a
// side alone from buildaroundCards. Basic lands are left out
// of both and listed per side instead, from the groups that match them.
func resolvePackages(cube *types.Cube, config design.DesignMapConfig, deckCardNames []string) []design.PackageCards {
	cardMap := buildCardMap(cube)
	groups := resolveGroups(cardMap, config, deckCardNames)
	basicGroups, _ := resolveGroupCards(basicLandCards(), config.Groups)
	buildarounds := buildaroundCards(widenWithDeckCards(cardMap, deckCardNames), config, groups.widened)

	out := make([]design.PackageCards, 0, len(config.Packages))
	for _, pkg := range config.Packages {
		resolved := design.PackageCards{Name: pkg.Name}
		for _, wire := range pkg.Wires {
			sources := withoutBasics(wireSide(groups.widened, wire.Sources))
			targets := withoutBasics(wireSide(groups.widened, wire.Targets))
			cubeSources := withoutBasics(wireSide(groups.cube, wire.Sources))
			cubeTargets := withoutBasics(wireSide(groups.cube, wire.Targets))
			resolved.Wires = append(resolved.Wires, design.WireCards{
				Sources:      sources,
				Targets:      targets,
				NeedSources:  sideNeed(cubeSources, sources, len(cubeTargets)),
				NeedTargets:  sideNeed(cubeTargets, targets, len(cubeSources)),
				SourceBasics: sideBasics(basicGroups, wire.Sources),
				TargetBasics: sideBasics(basicGroups, wire.Targets),
				Buildarounds: wireBuildarounds(buildarounds, sources, targets),
			})
		}
		out = append(out, resolved)
	}
	slices.SortFunc(out, func(a, b design.PackageCards) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return out
}

// basicTypeLines gives each basic land's type line, so group conditions such
// as t:basic or t:forest can be run against the basics.
var basicTypeLines = map[string]string{
	"Plains":                "Basic Land — Plains",
	"Island":                "Basic Land — Island",
	"Swamp":                 "Basic Land — Swamp",
	"Mountain":              "Basic Land — Mountain",
	"Forest":                "Basic Land — Forest",
	"Wastes":                "Basic Land",
	"Snow-Covered Plains":   "Basic Snow Land — Plains",
	"Snow-Covered Island":   "Basic Snow Land — Island",
	"Snow-Covered Swamp":    "Basic Snow Land — Swamp",
	"Snow-Covered Mountain": "Basic Snow Land — Mountain",
	"Snow-Covered Forest":   "Basic Snow Land — Forest",
	"Snow-Covered Wastes":   "Basic Snow Land",
}

// basicLandCards is one card per basic land, built from its type line alone,
// for matching group conditions against the basics no cube list holds.
func basicLandCards() map[string]types.Card {
	out := make(map[string]types.Card, len(types.BasicLandNames))
	for _, name := range types.BasicLandNames {
		out[name] = types.FromOracle(types.OracleCard{Name: name, TypeLine: basicTypeLines[name]})
	}
	return out
}

// sideBasics returns the basic lands that one wire side's groups match.
func sideBasics(basicGroups map[string]map[string]bool, entries []string) map[string]bool {
	out := make(map[string]bool)
	for _, entry := range entries {
		for name := range basicGroups[entry] {
			out[name] = true
		}
	}
	return out
}

// sideNeed is how many cards a deck must play from one wire side, from the
// side's size in the cube against the other side's, otherCube. A side whose
// cards were all cut is the scarcer side, so the old decks that played them
// still count when they played two.
func sideNeed(cubeSide, side map[string]bool, otherCube int) int {
	if len(cubeSide) == 0 && len(side) > 0 {
		return 2
	}
	return design.SideMinimum(len(cubeSide), otherCube)
}

// wireBuildarounds is the build-arounds among a wire's cards.
func wireBuildarounds(buildarounds, sources, targets map[string]bool) map[string]bool {
	out := map[string]bool{}
	for _, side := range []map[string]bool{sources, targets} {
		for name := range side {
			if buildarounds[name] {
				out[name] = true
			}
		}
	}
	return out
}

func buildDesignGraph(cube *types.Cube, config design.DesignMapConfig, deckCardNames []string) DesignGraphResponse {
	cardMap := buildCardMap(cube)

	// Edges also reach cards cut from the cube that decks still play, so old
	// decks keep them connected. Nodes and the group graph stay cube-only.
	resolved := resolveGroups(cardMap, config, deckCardNames)
	groupCards, groupExcluded := resolved.cube, resolved.excluded

	edges := buildCardEdges(config.Packages, resolved.widened)

	// Connection counts reflect cube-to-cube edges only, so a cut card's edges
	// don't inflate the counts shown in the cube's design view.
	nodeCounts := make(map[string]int)
	for _, e := range edges {
		if _, ok := cardMap[e.Source]; !ok {
			continue
		}
		if _, ok := cardMap[e.Target]; !ok {
			continue
		}
		nodeCounts[e.Source]++
		nodeCounts[e.Target]++
	}

	// Include all cards as nodes, not just connected ones.
	var nodes []DesignGraphNode
	for name, card := range cardMap {
		nodes = append(nodes, DesignGraphNode{
			Name:            name,
			Colors:          card.Colors,
			Types:           card.Types,
			CMC:             card.CMC,
			ConnectionCount: nodeCounts[name],
		})
	}

	// Sort groups and packages by name for consistent display order.
	groups := make([]design.Group, len(config.Groups))
	copy(groups, config.Groups)
	slices.SortFunc(groups, func(a, b design.Group) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	packages := make([]design.Package, len(config.Packages))
	copy(packages, config.Packages)
	slices.SortFunc(packages, func(a, b design.Package) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	groupNodes, groupEdges, packageEdges := buildGroupGraph(config, groupCards, groupExcluded, edges)

	return DesignGraphResponse{
		Nodes:        nodes,
		Edges:        edges,
		Groups:       groups,
		Packages:     packages,
		GroupNodes:   groupNodes,
		GroupEdges:   groupEdges,
		PackageEdges: packageEdges,
	}
}

// buildGroupGraph aggregates the card-level graph up to the group level: one node
// per group, plus two edge sets between groups.
//
// cardEdges are derived from the actual card-level connections: two groups are joined
// whenever a card in one is connected to a card in the other, with weight equal to the
// number of distinct card-pairs spanning them. A card in multiple groups contributes
// to all of them, so this reflects how the groups actually relate through their cards.
//
// packageEdges instead mirror the package definitions directly: two groups are
// joined when a package names one as a source and the other as a target. This is
// the raw view of how the rules wire the groups together.
func buildGroupGraph(
	config design.DesignMapConfig,
	groupCards map[string]map[string]bool,
	groupExcluded map[string][]string,
	edges []DesignGraphEdge,
) (groupNodes []DesignGraphGroupNode, cardEdges, packageEdges []DesignGraphGroupEdge) {
	type groupEdgeKey struct{ source, target string }
	type cardPair struct{ a, b string }

	// finalize turns the accumulated card-pair and package maps into a sorted edge slice.
	finalize := func(pairs map[groupEdgeKey]map[cardPair]bool, packageSets map[groupEdgeKey]map[string]bool) []DesignGraphGroupEdge {
		out := make([]DesignGraphGroupEdge, 0, len(pairs))
		for gk, ps := range pairs {
			names := make([]string, 0, len(packageSets[gk]))
			for n := range packageSets[gk] {
				names = append(names, n)
			}
			slices.Sort(names)
			out = append(out, DesignGraphGroupEdge{
				Source:   gk.source,
				Target:   gk.target,
				Weight:   len(ps),
				Packages: names,
			})
		}
		slices.SortFunc(out, func(a, b DesignGraphGroupEdge) int {
			if c := strings.Compare(a.Source, b.Source); c != 0 {
				return c
			}
			return strings.Compare(a.Target, b.Target)
		})
		return out
	}

	// cardEdges: collapse each card-level edge onto every pair of groups its endpoints
	// belong to. Reverse index card name -> the groups that contain it (a card can be in many).
	cardGroups := make(map[string][]string)
	for g, cards := range groupCards {
		for name := range cards {
			cardGroups[name] = append(cardGroups[name], g)
		}
	}
	cardPairs := make(map[groupEdgeKey]map[cardPair]bool)
	cardPackages := make(map[groupEdgeKey]map[string]bool)
	for _, e := range edges {
		ca, cb := e.Source, e.Target
		if ca > cb {
			ca, cb = cb, ca
		}
		for _, gs := range cardGroups[e.Source] {
			for _, gt := range cardGroups[e.Target] {
				// Normalize so (A,B) and (B,A) collapse to one group edge.
				a, b := gs, gt
				if a > b {
					a, b = b, a
				}

				// Skip when both endpoints share a group: that's an intra-group edge,
				// not a group-to-group edge.
				if a == b {
					continue
				}
				gk := groupEdgeKey{a, b}
				if cardPairs[gk] == nil {
					cardPairs[gk] = make(map[cardPair]bool)
					cardPackages[gk] = make(map[string]bool)
				}
				cardPairs[gk][cardPair{ca, cb}] = true
				for _, n := range e.Packages {
					cardPackages[gk][n] = true
				}
			}
		}
	}
	cardEdges = finalize(cardPairs, cardPackages)

	// packageEdges: one edge per pair of groups named together by a package,
	// weighted by the full set of card-pairs the package implies between them.
	packagePairs := make(map[groupEdgeKey]map[cardPair]bool)
	packageNames := make(map[groupEdgeKey]map[string]bool)
	for _, pkg := range config.Packages {
		for _, wire := range pkg.Wires {
			for _, gs := range wire.Sources {
				for _, gt := range wire.Targets {
					a, b := gs, gt
					if a > b {
						a, b = b, a
					}
					if a == b {
						continue
					}
					gk := groupEdgeKey{a, b}
					if packagePairs[gk] == nil {
						packagePairs[gk] = make(map[cardPair]bool)
						packageNames[gk] = make(map[string]bool)
					}
					packageNames[gk][pkg.Name] = true
					for s := range groupCards[gs] {
						for t := range groupCards[gt] {
							if s == t {
								continue
							}
							cs, ct := s, t
							if cs > ct {
								cs, ct = ct, cs
							}
							packagePairs[gk][cardPair{cs, ct}] = true
						}
					}
				}
			}
		}
	}
	packageEdges = finalize(packagePairs, packageNames)

	// nodes: one per group, with card membership.
	groupNodes = make([]DesignGraphGroupNode, 0, len(config.Groups))
	for _, g := range config.Groups {
		cards := make([]string, 0, len(groupCards[g.Name]))
		for name := range groupCards[g.Name] {
			cards = append(cards, name)
		}
		slices.Sort(cards)
		groupNodes = append(groupNodes, DesignGraphGroupNode{
			Name:          g.Name,
			Kind:          "group",
			CardCount:     len(cards),
			Cards:         cards,
			ExcludedCards: groupExcluded[g.Name],
		})
	}

	// Card: wire references get their own nodes so card endpoints show up on the
	// theme-level map alongside the groups.
	for key, cards := range groupCards {
		if cardRefName(key) == "" {
			continue
		}
		members := make([]string, 0, len(cards))
		for name := range cards {
			members = append(members, name)
		}
		slices.Sort(members)
		groupNodes = append(groupNodes, DesignGraphGroupNode{
			Name:      key,
			Kind:      "card",
			CardCount: len(members),
			Cards:     members,
		})
	}
	slices.SortFunc(groupNodes, func(a, b DesignGraphGroupNode) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	return groupNodes, cardEdges, packageEdges
}

// matchCards evaluates a query string against all cards and returns the set
// of matching card names. The query language supports:
//
//	n:text      - card name contains text (case-insensitive)
//	o:text      - oracle text contains text (case-insensitive)
//	t:text      - card has type containing text (e.g., t:creature)
//	st:text     - card has subtype containing text (e.g., st:zombie)
//	c:COLORS    - card's colors include at least one of the listed colors (e.g., c:R, c:UB)
//	cmc:N       - CMC equals N
//	cmc<N       - CMC less than N
//	cmc<=N      - CMC at most N
//	cmc>N       - CMC greater than N
//	cmc>=N      - CMC at least N
//	pow<N       - power less than N
//	pow<=N      - power at most N
//	pow>=N      - power at least N
//	tou<=N      - toughness at most N
//	tou>=N      - toughness at least N
//	m:text      - mana cost contains text (e.g., m:X, m:{W}{W})
//	is:keyword  - built-in classification (creature, land, removal, counterspell, interaction)
//	otag:name   - Scryfall oracle tag by slug, label or alias (e.g., otag:removal, otag:"self mill")
//	o:"when ~ enters" - in text terms, ~ means the card itself: its name, a legend's
//	              short name, or "this creature", "this artifact" and the like
//	face:(...)  - any castable face matches: each half of a split, adventure or modal
//	              double-faced card on its own (e.g., face:(t:instant cmc<3) matches Fire // Ice)
//
// Negation: prefix any term with ! to negate it: !t:creature, !c:R, !is:land
//
// Multiple terms are ANDed. Use OR between terms for disjunction.
// Use parentheses for grouping: (t:enchantment OR t:artifact) cmc<=2
func matchCards(cards map[string]types.Card, query string) map[string]bool {
	result := make(map[string]bool)
	tokens := tokenize(query)
	expr := parseExpr(&tokens)

	for name, card := range cards {
		if expr.matches(card) {
			result[name] = true
		}
	}

	return result
}

// --- Expression tree ---

type exprNode interface {
	matches(card types.Card) bool

	// text rebuilds the node's query text, so a check can name the part of a
	// condition that passed or failed.
	text() string
}

type termNode struct {
	term    string
	negated bool
}

func (n *termNode) matches(card types.Card) bool {
	result := matchTerm(card, n.term)
	if n.negated {
		return !result
	}
	return result
}

func (n *termNode) text() string {
	// The tokenizer drops quotes, so put them back around a value with spaces.
	term := n.term
	if prefix, value, ok := strings.Cut(term, ":"); ok && strings.Contains(value, " ") {
		term = prefix + `:"` + value + `"`
	}
	if n.negated {
		return "!" + term
	}
	return term
}

type andNode struct {
	children []exprNode
}

func (n *andNode) matches(card types.Card) bool {
	for _, child := range n.children {
		if !child.matches(card) {
			return false
		}
	}
	return true
}

func (n *andNode) text() string {
	parts := make([]string, 0, len(n.children))
	for _, child := range n.children {
		parts = append(parts, child.text())
	}
	return strings.Join(parts, " ")
}

type orNode struct {
	children []exprNode
}

func (n *orNode) matches(card types.Card) bool {
	for _, child := range n.children {
		if child.matches(card) {
			return true
		}
	}
	return false
}

func (n *orNode) text() string {
	parts := make([]string, 0, len(n.children))
	for _, child := range n.children {
		parts = append(parts, child.text())
	}
	return "(" + strings.Join(parts, " OR ") + ")"
}

// --- Parser: recursive descent ---
// Grammar:
//   expr    = andExpr ("OR" andExpr)*
//   andExpr = primary ("AND"? primary)*
//   primary = "(" expr ")" | "!" primary | term

func parseExpr(tokens *[]string) exprNode {
	left := parseAndExpr(tokens)
	var orChildren []exprNode
	orChildren = append(orChildren, left)

	for len(*tokens) > 0 && (*tokens)[0] == "OR" {
		*tokens = (*tokens)[1:] // consume OR
		orChildren = append(orChildren, parseAndExpr(tokens))
	}

	if len(orChildren) == 1 {
		return orChildren[0]
	}
	return &orNode{children: orChildren}
}

func parseAndExpr(tokens *[]string) exprNode {
	left := parsePrimary(tokens)
	var andChildren []exprNode
	andChildren = append(andChildren, left)

	for len(*tokens) > 0 {
		tok := (*tokens)[0]
		if tok == ")" || tok == "OR" {
			break
		}
		if tok == "AND" {
			*tokens = (*tokens)[1:] // consume explicit AND
		}
		andChildren = append(andChildren, parsePrimary(tokens))
	}

	if len(andChildren) == 1 {
		return andChildren[0]
	}
	return &andNode{children: andChildren}
}

func parsePrimary(tokens *[]string) exprNode {
	if len(*tokens) == 0 {
		return &termNode{term: ""}
	}

	tok := (*tokens)[0]

	// Parenthesized group.
	if tok == "(" {
		*tokens = (*tokens)[1:] // consume (
		inner := parseExpr(tokens)
		if len(*tokens) > 0 && (*tokens)[0] == ")" {
			*tokens = (*tokens)[1:] // consume )
		}
		return inner
	}

	// Negation.
	if tok == "!" {
		*tokens = (*tokens)[1:] // consume !
		child := parsePrimary(tokens)
		// If the child is already a termNode, just flip its negated flag.
		if tn, ok := child.(*termNode); ok {
			tn.negated = !tn.negated
			return tn
		}
		// For complex negated expressions like !(a OR b), wrap in a negation.
		return &notNode{child: child}
	}

	// A face group: face:( ... ), or !face:( ... ).
	if face := strings.ToLower(tok); (face == "face:" || face == "!face:") && len(*tokens) > 1 && (*tokens)[1] == "(" {
		*tokens = (*tokens)[2:]
		inner := parseExpr(tokens)
		if len(*tokens) > 0 && (*tokens)[0] == ")" {
			*tokens = (*tokens)[1:]
		}
		node := exprNode(&faceNode{child: inner})
		if face == "!face:" {
			node = &notNode{child: node}
		}
		return node
	}

	// Term token (possibly with ! prefix baked in from tokenizer).
	*tokens = (*tokens)[1:]
	if strings.HasPrefix(tok, "!") {
		return &termNode{term: tok[1:], negated: true}
	}
	return &termNode{term: tok}
}

// faceNode matches a card when any face it can cast on its own matches
// child, so a split or adventure card is judged by each half. A card with no
// such faces is judged whole.
type faceNode struct {
	child exprNode
}

func (n *faceNode) matches(card types.Card) bool {
	if len(card.Faces) == 0 {
		return n.child.matches(card)
	}
	for _, f := range card.Faces {
		if n.child.matches(f) {
			return true
		}
	}
	return false
}

func (n *faceNode) text() string {
	inner := n.child.text()
	if strings.HasPrefix(inner, "(") {
		return "face:" + inner
	}
	return "face:(" + inner + ")"
}

type notNode struct {
	child exprNode
}

func (n *notNode) matches(card types.Card) bool {
	return !n.child.matches(card)
}

func (n *notNode) text() string {
	inner := n.child.text()
	if strings.HasPrefix(inner, "(") {
		return "!" + inner
	}
	return "!(" + inner + ")"
}

// --- Tokenizer ---

// tokenize splits a query string into tokens: terms, "(", ")", "AND", "OR".
// Supports quoted values: o:"enters the battlefield"
// Supports negation prefix: !t:creature
func tokenize(query string) []string {
	var tokens []string
	i := 0
	for i < len(query) {
		// Skip whitespace.
		if query[i] == ' ' || query[i] == '\t' {
			i++
			continue
		}

		// Parentheses.
		if query[i] == '(' || query[i] == ')' {
			tokens = append(tokens, string(query[i]))
			i++
			continue
		}

		// Standalone negation: "!" followed by "(" or a term.
		if query[i] == '!' && i+1 < len(query) && query[i+1] == '(' {
			tokens = append(tokens, "!")
			i++
			continue
		}

		// Read a word/term until whitespace or paren.
		start := i
		for i < len(query) && query[i] != ' ' && query[i] != '\t' && query[i] != '(' && query[i] != ')' {
			// Handle quoted strings within a term.
			if query[i] == '"' {
				i++
				for i < len(query) && query[i] != '"' {
					i++
				}
				if i < len(query) {
					i++ // consume closing quote
				}
			} else {
				i++
			}
		}

		word := query[start:i]

		// Check for AND/OR keywords.
		if word == "AND" || word == "OR" {
			tokens = append(tokens, word)
			continue
		}

		// Strip quotes from within the term value (e.g., o:"foo bar" -> o:foo bar).
		word = stripTermQuotes(word)
		tokens = append(tokens, word)
	}
	return tokens
}

// stripTermQuotes removes quotes from the value portion of a term.
// e.g., o:"enters the battlefield" -> o:enters the battlefield
// e.g., !o:"foo" -> !o:foo
func stripTermQuotes(term string) string {
	// Find the colon that separates prefix from value.
	raw := term
	prefix := ""
	if strings.HasPrefix(raw, "!") {
		prefix = "!"
		raw = raw[1:]
	}
	colonIdx := strings.Index(raw, ":")
	if colonIdx == -1 {
		return term
	}
	key := raw[:colonIdx+1]
	val := raw[colonIdx+1:]
	// Strip surrounding quotes from value.
	if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
		val = val[1 : len(val)-1]
	}
	return prefix + key + val
}

func matchTerm(card types.Card, term string) bool {
	lower := strings.ToLower(term)

	// Handle comparison operators for cmc, pow, tou.
	// Check two-char ops (<=, >=) before single-char ops (<, >).
	for _, prefix := range []string{"cmc<=", "cmc>=", "pow<=", "pow>=", "tou<=", "tou>="} {
		if strings.HasPrefix(lower, prefix) {
			return matchComparison(card, prefix[:3], string(prefix[3:5]), lower[len(prefix):])
		}
	}
	for _, prefix := range []string{"cmc<", "cmc>", "pow<", "pow>", "tou<", "tou>"} {
		if strings.HasPrefix(lower, prefix) {
			return matchComparison(card, prefix[:3], string(prefix[3:4]), lower[len(prefix):])
		}
	}

	// Handle colon-based terms.
	if idx := strings.Index(term, ":"); idx != -1 {
		prefix := strings.ToLower(term[:idx])
		value := term[idx+1:]
		return matchPrefixedTerm(card, prefix, value)
	}

	// Bare term: match against card name.
	return wildcardMatch(strings.ToLower(card.Name), lower)
}

func matchPrefixedTerm(card types.Card, prefix, value string) bool {
	lowerValue := strings.ToLower(value)

	switch prefix {
	case "n":
		return wildcardMatch(strings.ToLower(card.Name), lowerValue)
	case "o":
		if strings.Contains(lowerValue, "~") {
			return wildcardMatch(selfText(card), lowerValue)
		}
		return wildcardMatch(strings.ToLower(card.OracleText), lowerValue)
	case "t":
		for _, t := range card.Types {
			if wildcardMatch(strings.ToLower(t), lowerValue) {
				return true
			}
		}
		for _, st := range card.SubTypes {
			if wildcardMatch(strings.ToLower(st), lowerValue) {
				return true
			}
		}
		return false
	case "st":
		for _, st := range card.SubTypes {
			if wildcardMatch(strings.ToLower(st), lowerValue) {
				return true
			}
		}
		return false
	case "m":
		return wildcardMatch(strings.ToLower(card.ManaCost), lowerValue)
	case "c":
		return matchColor(card, strings.ToUpper(value))
	case "cmc":
		n, err := strconv.Atoi(value)
		if err != nil {
			return false
		}
		return card.CMC == n
	case "is":
		return matchIs(card, lowerValue)
	case "otag":
		return card.HasTag(value)
	default:
		logrus.WithField("prefix", prefix).Warn("unknown query prefix")
		return false
	}
}

// wildcardMatch checks if haystack contains the pattern, where * in pattern
// matches any sequence of characters. Without wildcards it behaves like
// strings.Contains.
func wildcardMatch(haystack, pattern string) bool {
	if !strings.Contains(pattern, "*") {
		return strings.Contains(haystack, pattern)
	}
	// Convert the wildcard pattern to a regex: escape regex metacharacters,
	// then replace * with .*
	escaped := regexp.QuoteMeta(pattern)
	escaped = strings.ReplaceAll(escaped, `\*`, ".*")
	re, err := regexp.Compile(escaped)
	if err != nil {
		return strings.Contains(haystack, pattern)
	}
	return re.MatchString(haystack)
}

// selfWords are the words oracle text uses after "this" to mean the card
// itself.
var selfWords = []string{
	"creature",
	"artifact",
	"enchantment",
	"equipment",
	"aura",
	"vehicle",
	"land",
	"saga",
	"permanent",
	"planeswalker",
	"battle",
	"spell",
	"card",
	"class",
	"case",
	"room",
}

// selfText is the card's lowercased oracle text with every reference to the
// card itself replaced by "~", as Scryfall's ~ search does: its full name,
// each face's name, a legend's short name before the comma, and "this
// creature" and the like.
func selfText(card types.Card) string {
	text := strings.ToLower(card.OracleText)
	var names []string
	for _, face := range strings.Split(card.Name, "//") {
		name := strings.ToLower(strings.TrimSpace(face))
		names = append(names, name)
		if short, _, ok := strings.Cut(name, ","); ok {
			names = append(names, short)
		}
	}

	// Longer names go first so a short name doesn't split a full one.
	slices.SortFunc(names, func(a, b string) int { return len(b) - len(a) })
	for _, name := range names {
		if name != "" {
			text = strings.ReplaceAll(text, name, "~")
		}
	}
	for _, word := range selfWords {
		text = strings.ReplaceAll(text, "this "+word, "~")
	}
	return text
}

// matchColor returns true if the card has at least one of the specified colors.
// e.g., "R" matches red cards, "UB" matches cards that are blue or black.
func matchColor(card types.Card, colors string) bool {
	for _, c := range colors {
		if slices.Contains(card.Colors, string(c)) {
			return true
		}
	}
	// If no colors specified or card is colorless, handle edge case.
	if len(colors) == 0 {
		return len(card.Colors) == 0
	}
	return false
}

func matchIs(card types.Card, keyword string) bool {
	switch keyword {
	case "creature":
		return card.IsCreature()
	case "land":
		return card.IsLand()
	case "removal":
		return card.IsRemoval()
	case "counterspell":
		return card.IsCounterspell()
	case "interaction":
		return card.IsInteraction()
	case "handhate":
		return card.IsHandDisruption()
	default:
		logrus.WithField("keyword", keyword).Warn("unknown is: keyword")
		return false
	}
}

func matchComparison(card types.Card, field, op, valueStr string) bool {
	n, err := strconv.Atoi(valueStr)
	if err != nil {
		return false
	}

	var cardVal int
	switch field {
	case "cmc":
		cardVal = card.CMC
	case "pow":
		v, err := strconv.Atoi(card.Power)
		if err != nil {
			return false
		}
		cardVal = v
	case "tou":
		v, err := strconv.Atoi(card.Toughness)
		if err != nil {
			return false
		}
		cardVal = v
	default:
		return false
	}

	switch op {
	case "<=":
		return cardVal <= n
	case ">=":
		return cardVal >= n
	case "<":
		return cardVal < n
	case ">":
		return cardVal > n
	default:
		return false
	}
}

// SaveDesignRulesHandler handles POST /api/save-design-rules to persist design map config.
func SaveDesignRulesHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Unknown fields are refused so a page still running an older UI, which
		// sends "links" instead of "packages", can't save rules with no packages.
		var config design.DesignMapConfig
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&config); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		cubeID := server.CubeFromRequest(r)
		if cubeID == "" {
			http.Error(rw, "no cube in request", http.StatusForbidden)
			return
		}
		if httperr.WriteStoreError(rw, store.PutRules(cubeID, &config), "could not save config for "+cubeID) {
			return
		}

		rw.WriteHeader(http.StatusOK)
	})
}
