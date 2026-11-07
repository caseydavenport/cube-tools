// Package deckquery turns a handler's deck request into decks. Every handler
// that reads a cube's decks goes through it, so package: terms and the
// store choice work the same on every page.
package deckquery

import (
	"fmt"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// PackagesLoader returns a cube's packages resolved to card names. It's
// injected because package resolution lives in the stats package, which
// imports this one.
type PackagesLoader func(cubeID string) ([]design.PackageCards, error)

// Query reads decks and cubes for handlers.
type Query struct {
	store    storage.DeckStorage
	cubes    types.CubeSource
	packages PackagesLoader
}

// New returns a Query over the server's store and cube source. packages may
// be nil, in which case package: terms match no decks.
func New(store storage.DeckStorage, cubes types.CubeSource, packages PackagesLoader) *Query {
	return &Query{store: store, cubes: cubes, packages: packages}
}

// Decks lists the cube's decks matching dr, loading the cube's packages when
// dr.Match has a package: term. A nil dr lists every deck. dr itself is left
// unchanged.
func (q *Query) Decks(cubeID string, dr *storage.DecksRequest) ([]*storage.Deck, error) {
	req := storage.DecksRequest{}
	if dr != nil {
		req = *dr
	}
	pkgs, err := q.Packages(cubeID, req.Match)
	if err != nil {
		return nil, err
	}
	req.Packages = pkgs
	return q.store.List(cubeID, &req)
}

// Packages returns the cube's resolved packages when match has a package:
// term, and nil otherwise.
func (q *Query) Packages(cubeID, match string) ([]design.PackageCards, error) {
	if q.packages == nil || !usesPackages(match) {
		return nil, nil
	}
	pkgs, err := q.packages(cubeID)
	if err != nil {
		// Handlers answer this with a bare 500, so the cause is logged here.
		err = fmt.Errorf("load packages for %s: %w", cubeID, err)
		logrus.WithError(err).Error("could not answer package filter")
		return nil, err
	}
	return pkgs, nil
}

// Cube returns the cube's current card list.
func (q *Query) Cube(cubeID string) (*types.Cube, error) {
	return q.cubes.Current(cubeID)
}

// usesPackages reports whether a deck search has a package: term, so the
// cube's packages are loaded only when needed. A search that doesn't parse
// needs none, since it matches no deck.
func usesPackages(match string) bool {
	q, err := search.Compile(match, search.TargetDecks)
	return err == nil && q.UsesPackages()
}
