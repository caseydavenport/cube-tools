// Package rulebook loads a cube's design rules and resolves them against its
// cards: which cards each group holds, which cards fill each package's wires,
// and which drafts' lists support each package.
package rulebook

import (
	"errors"
	"slices"
	"strings"
	"sync"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Rulebook is one cube's rules, loaded with everything they are resolved
// against: today's list, every deck and each draft's list. It resolves its
// groups and packages on first use and keeps them, so load one per request
// and share it. Nothing changes it after Load, and callers must not modify
// what it returns.
type Rulebook struct {
	cubeID        string
	cube          *types.Cube
	config        design.DesignMapConfig
	decks         []*storage.Deck
	played        []string
	deckCardNames []string
	lists         cardLists
	overrides     design.PackageOverrides

	cardMapOnce  sync.Once
	cardMap      map[string]types.Card
	groupsOnce   sync.Once
	groups       Groups
	packagesOnce sync.Once
	packages     []design.PackageCards
}

// Load reads a cube's list, rules, decks, draft lists and overrides. A store
// without rules support gives empty rules, and any other rules error fails.
// A failure to list decks or read overrides is only logged, since it loses
// cut cards or forced packages but nothing else.
func Load(store storage.DeckStorage, src types.CubeSource, cubeID string) (*Rulebook, error) {
	cube, err := src.Current(cubeID)
	if err != nil {
		return nil, err
	}
	var config design.DesignMapConfig
	cfg, err := store.GetRules(cubeID)
	switch {
	case errors.Is(err, storage.ErrUnsupported):
	case err != nil:
		return nil, err
	default:
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
	played := distinctCardNames(decks)
	return &Rulebook{
		cubeID:        cubeID,
		cube:          cube,
		config:        config,
		decks:         decks,
		played:        played,
		deckCardNames: append(slices.Clone(played), lists.snapshotOnlyNames()...),
		lists:         lists,
		overrides:     overrides,
	}, nil
}

// CubeID is the cube the rulebook was loaded for.
func (rb *Rulebook) CubeID() string {
	return rb.cubeID
}

// Cube is today's card list.
func (rb *Rulebook) Cube() *types.Cube {
	return rb.cube
}

// Config is the rules as saved, every package included.
func (rb *Rulebook) Config() design.DesignMapConfig {
	return rb.config
}

// Decks is every deck in the cube, whatever its date.
func (rb *Rulebook) Decks() []*storage.Deck {
	return rb.decks
}

// PlayedCardNames is the distinct non-basic cards decks have played, cut
// cards included. The design graph links only these.
func (rb *Rulebook) PlayedCardNames() []string {
	return rb.played
}

// DraftLists maps each draft whose saved list holds cards to those card
// names. A draft left out has no usable list, so every card counts as
// available in it.
func (rb *Rulebook) DraftLists() map[int]map[string]bool {
	return rb.lists.known()
}

// CardMap is today's list by name, without basic lands.
func (rb *Rulebook) CardMap() map[string]types.Card {
	rb.cardMapOnce.Do(func() { rb.cardMap = buildCardMap(rb.cube) })
	return rb.cardMap
}

// Groups is the rules' groups and card: entries resolved to card names.
func (rb *Rulebook) Groups() Groups {
	rb.groupsOnce.Do(func() { rb.groups = resolveGroups(rb.CardMap(), rb.config, rb.deckCardNames) })
	return rb.groups
}

// BasicGroups is the groups and their basic land members, for the groups
// that match any basics; no list holds basics, so Groups leaves them out.
func (rb *Rulebook) BasicGroups() Members {
	members, _ := matchGroups(basicLandCards(), rb.config.Groups)
	return members
}

// Entries lists the groups and card: entries a card is in, for a card outside
// today's list and the decks, such as a candidate in the explorer.
func (rb *Rulebook) Entries(card types.Card) []string {
	var out []string
	for _, m := range NewMatcher(rb.config.Groups).Match(card) {
		if !m.Excluded {
			out = append(out, m.Group.Name)
		}
	}
	for _, p := range rb.config.Packages {
		for _, w := range p.Wires {
			for _, entry := range slices.Concat(w.Sources, w.Targets) {
				if design.CardRefName(entry) == card.Name && !slices.Contains(out, entry) {
					out = append(out, entry)
				}
			}
		}
	}
	return out
}

// Packages is every package resolved to card names with its relevance
// attached, sorted by name.
func (rb *Rulebook) Packages() []design.PackageCards {
	rb.packagesOnce.Do(func() {
		rb.packages = resolvePackages(rb.CardMap(), rb.Groups(), rb.config, rb.deckCardNames)
		attachRelevance(rb.packages, rb.lists, rb.overrides)
	})
	return rb.packages
}

// PackagesWith resolves another rule set against the same cards, decks and
// lists, such as a proposed edit. Nothing is kept.
func (rb *Rulebook) PackagesWith(config design.DesignMapConfig) []design.PackageCards {
	groups := resolveGroups(rb.CardMap(), config, rb.deckCardNames)
	pkgs := resolvePackages(rb.CardMap(), groups, config, rb.deckCardNames)
	attachRelevance(pkgs, rb.lists, rb.overrides)
	return pkgs
}

// Package finds a package by name, ignoring case.
func (rb *Rulebook) Package(name string) (design.Package, bool) {
	i := slices.IndexFunc(rb.config.Packages, func(p design.Package) bool { return strings.EqualFold(p.Name, name) })
	if i < 0 {
		return design.Package{}, false
	}
	return rb.config.Packages[i], true
}

// Group finds a group by its exact name.
func (rb *Rulebook) Group(name string) (design.Group, bool) {
	i := slices.IndexFunc(rb.config.Groups, func(g design.Group) bool { return g.Name == name })
	if i < 0 {
		return design.Group{}, false
	}
	return rb.config.Groups[i], true
}

// Forced is "on" or "off" when the overrides force the named package, and ""
// otherwise. Names match ignoring case.
func (rb *Rulebook) Forced(name string) string {
	if slices.ContainsFunc(rb.overrides.On, func(n string) bool { return strings.EqualFold(n, name) }) {
		return "on"
	}
	if slices.ContainsFunc(rb.overrides.Off, func(n string) bool { return strings.EqualFold(n, name) }) {
		return "off"
	}
	return ""
}

// SupportedToday reports whether today's list supports the package, before
// the overrides force it either way.
func (rb *Rulebook) SupportedToday(p design.PackageCards) bool {
	return p.PresentIn(rb.lists.today)
}

// Shown is the packages a view shows: those keep accepts by relevance, such
// as InAny over a date range's drafts.
func (rb *Rulebook) Shown(keep func(*design.Relevance) bool) View {
	var pkgs []design.PackageCards
	for _, p := range rb.Packages() {
		if keep(p.Relevance) {
			pkgs = append(pkgs, p)
		}
	}
	return View{packages: pkgs, config: configFor(rb.config, pkgs)}
}

// View is the packages one view shows, both resolved and as rules, with every
// group kept.
type View struct {
	packages []design.PackageCards
	config   design.DesignMapConfig
}

// Packages is the shown packages, resolved.
func (v View) Packages() []design.PackageCards {
	return v.packages
}

// Config is the rules with only the shown packages.
func (v View) Config() design.DesignMapConfig {
	return v.config
}

// configFor returns config with only the packages in pkgs.
func configFor(config design.DesignMapConfig, pkgs []design.PackageCards) design.DesignMapConfig {
	shown := map[string]bool{}
	for _, p := range pkgs {
		shown[p.Name] = true
	}
	out := config
	out.Packages = nil
	for _, p := range config.Packages {
		if shown[p.Name] {
			out.Packages = append(out.Packages, p)
		}
	}
	return out
}

// distinctCardNames returns the distinct non-basic mainboard card names
// across the decks.
func distinctCardNames(decks []*storage.Deck) []string {
	seen := make(map[string]bool)
	var names []string
	for _, d := range decks {
		for _, c := range d.Mainboard {
			if types.IsBasic(c.Name) || seen[c.Name] {
				continue
			}
			seen[c.Name] = true
			names = append(names, c.Name)
		}
	}
	return names
}
