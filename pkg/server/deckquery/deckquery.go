// Package deckquery turns a handler's deck request into decks. Every handler
// that reads a cube's decks goes through it, so package: terms and the
// store choice work the same on every page.
package deckquery

import (
	"fmt"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Query reads decks and cubes for handlers.
type Query struct {
	store storage.DeckStorage
	cubes types.CubeSource
}

// New returns a Query over the server's store and cube source.
func New(store storage.DeckStorage, cubes types.CubeSource) *Query {
	return &Query{store: store, cubes: cubes}
}

// Decks lists the cube's decks matching dr, loading the cube's rulebook only
// when dr.Match has a package: term. A nil dr lists every deck. dr itself is
// left unchanged.
func (q *Query) Decks(cubeID string, dr *storage.DecksRequest) ([]*storage.Deck, error) {
	req := copyRequest(dr)
	pkgs, err := q.Packages(cubeID, req.Match)
	if err != nil {
		return nil, err
	}
	req.Packages = pkgs
	return q.store.List(cubeID, &req)
}

// DecksIn lists the decks matching dr like Decks, answering package: terms
// from a rulebook the caller already loaded, for its cube.
func (q *Query) DecksIn(rb *rulebook.Rulebook, dr *storage.DecksRequest) ([]*storage.Deck, error) {
	req := copyRequest(dr)
	if usesPackages(req.Match) {
		req.Packages = rb.Packages()
	}
	return q.store.List(rb.CubeID(), &req)
}

// Packages returns the cube's resolved packages when match has a package:
// term, and nil otherwise.
func (q *Query) Packages(cubeID, match string) ([]design.PackageCards, error) {
	if !usesPackages(match) {
		return nil, nil
	}
	rb, err := rulebook.Load(q.store, q.cubes, cubeID)
	if err != nil {
		// Handlers answer this with a bare 500, so the cause is logged here.
		err = fmt.Errorf("load packages for %s: %w", cubeID, err)
		logrus.WithError(err).Error("could not answer package filter")
		return nil, err
	}
	return rb.Packages(), nil
}

// Cube returns the cube's current card list.
func (q *Query) Cube(cubeID string) (*types.Cube, error) {
	return q.cubes.Current(cubeID)
}

// copyRequest returns a copy of dr that the caller can fill in without
// changing dr, or an empty request when dr is nil.
func copyRequest(dr *storage.DecksRequest) storage.DecksRequest {
	if dr == nil {
		return storage.DecksRequest{}
	}
	return *dr
}

// usesPackages reports whether a deck search has a package: term, so the
// cube's packages are loaded only when needed. A search that doesn't parse
// needs none, since it matches no deck.
func usesPackages(match string) bool {
	q, err := search.Compile(match, search.TargetDecks)
	return err == nil && q.UsesPackages()
}
