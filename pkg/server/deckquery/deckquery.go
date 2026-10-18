// Package deckquery turns a handler's deck request into decks. Every handler
// that reads a cube's decks goes through it, so community: terms and the
// store choice work the same on every page.
package deckquery

import (
	"fmt"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// EdgesLoader returns a cube's design-graph edges. It's injected because the
// design graph lives in the stats package, which imports this one.
type EdgesLoader func(cubeID string) ([]graph.Edge, error)

// Query reads decks and cubes for handlers.
type Query struct {
	store storage.DeckStorage
	cubes types.CubeSource
	edges EdgesLoader
}

// New returns a Query over the server's store and cube source. edges may be
// nil, in which case community: terms match no decks.
func New(store storage.DeckStorage, cubes types.CubeSource, edges EdgesLoader) *Query {
	return &Query{store: store, cubes: cubes, edges: edges}
}

// Decks lists the cube's decks matching dr, loading the design graph when
// dr.Match has a community: term. A nil dr lists every deck. dr itself is
// left unchanged.
func (q *Query) Decks(cubeID string, dr *storage.DecksRequest) ([]*storage.Deck, error) {
	req := storage.DecksRequest{}
	if dr != nil {
		req = *dr
	}
	edges, err := q.Edges(cubeID, req.Match)
	if err != nil {
		return nil, err
	}
	req.CommunityEdges = edges
	return q.store.List(cubeID, &req)
}

// Edges returns the cube's design-graph edges when match has a community:
// term, and nil otherwise.
func (q *Query) Edges(cubeID, match string) ([]graph.Edge, error) {
	if q.edges == nil || !query.HasCommunityTerm(match) {
		return nil, nil
	}
	edges, err := q.edges(cubeID)
	if err != nil {
		// Handlers answer this with a bare 500, so the cause is logged here.
		err = fmt.Errorf("load design graph for %s: %w", cubeID, err)
		logrus.WithError(err).Error("could not answer community filter")
		return nil, err
	}
	return edges, nil
}

// Cube returns the cube's current card list.
func (q *Query) Cube(cubeID string) (*types.Cube, error) {
	return q.cubes.Current(cubeID)
}
