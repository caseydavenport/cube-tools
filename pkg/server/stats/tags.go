package stats

import (
	"cmp"
	"encoding/json"
	"net/http"
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	// minDistinctiveCards is how many cube cards a tag needs before it can rank
	// as distinctive, so a tag on two cards can't top the list by chance.
	minDistinctiveCards = 8

	// maxDistinctiveTags caps the distinctive list.
	maxDistinctiveTags = 30
)

// hiddenTagRoots are trivia tags (card names, printed cycles, ability
// bookkeeping). They and every tag under them stay out of tag lists, though
// otag: searches still match them.
var hiddenTagRoots = []string{
	"cycle",
	"card-names",
	"triggered-ability",
	"activated-ability",
	"passive-ability",
	"flavors-of-vanilla",
	"staple-with-set-s-mechanic",
	"cheaper-than-mv",
	"mixed-subtypes",
}

// TagRow is one Scryfall tag on a cube's cards. Cards counts the cube cards
// carrying it, and Lift is how many times more common it is in the cube than
// across all of Magic.
type TagRow struct {
	Slug        string  `json:"slug"`
	Label       string  `json:"label"`
	Description string  `json:"description"`
	Cards       int     `json:"cards"`
	Lift        float64 `json:"lift"`
}

// TagsResponse lists a cube's tags twice: Tags by how many cube cards carry
// them, for pickers, and Distinctive by lift, for seeing what sets the cube
// apart. Total is the number of cube cards.
type TagsResponse struct {
	Total       int      `json:"total"`
	Tags        []TagRow `json:"tags"`
	Distinctive []TagRow `json:"distinctive"`
}

// TagsHandler serves the current cube's Scryfall tags.
func TagsHandler(src types.CubeSource) http.Handler {
	return &tagsHandler{src: src}
}

type tagsHandler struct {
	src types.CubeSource
}

// ServeHTTP answers with the cube's tags, ranked by count and by lift.
func (h *tagsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cube, err := h.src.Current(server.CubeFromRequest(r))
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}

	b, err := json.Marshal(tagRows(cube.Cards, types.DistinctOracleCardCount()))
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write tags response")
	}
}

// tagRows counts the visible tags on cards and ranks them. oracleTotal is how
// many cards all of Magic has, the baseline for lift; at zero, lift reads 0.
func tagRows(cards []types.Card, oracleTotal int) TagsResponse {
	// Count the cube cards under each tag.
	counts := map[string]int{}
	for _, card := range cards {
		for _, slug := range card.OracleTags {
			counts[slug]++
		}
	}

	resp := TagsResponse{Total: len(cards), Tags: []TagRow{}, Distinctive: []TagRow{}}
	for slug, count := range counts {
		tag, ok := types.LookupOracleTag(slug)
		if !ok || isHiddenTag(tag) {
			continue
		}
		resp.Tags = append(resp.Tags, TagRow{
			Slug:        tag.Slug,
			Label:       tag.Label,
			Description: tag.Description,
			Cards:       count,
			Lift:        tagLift(count, len(cards), tag.Cards, oracleTotal),
		})
	}

	// Most common first, with the slug as a tiebreaker for a stable order.
	slices.SortFunc(resp.Tags, func(a, b TagRow) int {
		if a.Cards != b.Cards {
			return b.Cards - a.Cards
		}
		return cmp.Compare(a.Slug, b.Slug)
	})

	// Rank the tags common enough to trust by lift.
	for _, row := range resp.Tags {
		if row.Cards >= minDistinctiveCards {
			resp.Distinctive = append(resp.Distinctive, row)
		}
	}
	slices.SortStableFunc(resp.Distinctive, func(a, b TagRow) int {
		return cmp.Compare(b.Lift, a.Lift)
	})
	if len(resp.Distinctive) > maxDistinctiveTags {
		resp.Distinctive = resp.Distinctive[:maxDistinctiveTags]
	}
	return resp
}

// tagLift is the tag's share of the cube divided by its share of all cards.
// It is 0 when either share has nothing to divide by.
func tagLift(cubeCount, cubeTotal, oracleCount, oracleTotal int) float64 {
	if cubeTotal == 0 || oracleCount == 0 || oracleTotal == 0 {
		return 0
	}
	cubeShare := float64(cubeCount) / float64(cubeTotal)
	oracleShare := float64(oracleCount) / float64(oracleTotal)
	return cubeShare / oracleShare
}

// isHiddenTag reports whether the tag, or any tag above it, is trivia.
func isHiddenTag(tag types.OracleTag) bool {
	if slices.Contains(hiddenTagRoots, tag.Slug) {
		return true
	}
	for _, ancestor := range tag.Ancestors {
		if slices.Contains(hiddenTagRoots, ancestor) {
			return true
		}
	}
	return false
}
