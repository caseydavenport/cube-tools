package types

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"
)

// OracleTag is one Scryfall community tag on cards' rules (e.g. "removal").
// Ancestors are the broader tags it sits under, and Cards counts every card
// in Scryfall's data that carries it, directly or through a narrower tag.
type OracleTag struct {
	Slug        string   `json:"slug"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Ancestors   []string `json:"ancestors,omitempty"`
	Cards       int      `json:"cards"`
}

// rawTagging is one card a tag is applied to, by its Scryfall oracle id.
type rawTagging struct {
	OracleID string `json:"oracle_id"`
}

// rawTag is one line of Scryfall's oracle_tags bulk file.
type rawTag struct {
	ID          string       `json:"id"`
	Slug        string       `json:"slug"`
	Label       string       `json:"label"`
	Description string       `json:"description"`
	Aliases     []string     `json:"aliases"`
	ParentIDs   []string     `json:"parent_ids"`
	Taggings    []rawTagging `json:"taggings"`
}

// tagIndex holds the loaded tags: each card's tags by oracle id, each tag by
// slug, and every spelling a search may use for a tag.
type tagIndex struct {
	byOracleID map[string][]string
	bySlug     map[string]OracleTag
	byName     map[string]string
}

// newTagIndex returns an index with no tags in it.
func newTagIndex() tagIndex {
	return tagIndex{
		byOracleID: map[string][]string{},
		bySlug:     map[string]OracleTag{},
		byName:     map[string]string{},
	}
}

var oracleTags = newTagIndex()

// setOracleTags replaces the loaded tags.
func setOracleTags(idx tagIndex) {
	oracleTags = idx
}

// LoadOracleTags loads Scryfall's oracle_tags bulk file (JSONL, one tag per
// line) from path, replacing any tags loaded before. Each card gets its
// directly tagged slugs plus every ancestor's, the way Scryfall's otag:
// search works. On error the previously loaded tags stay in place.
func LoadOracleTags(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() {
		if err := f.Close(); err != nil {
			logrus.WithError(err).WithField("path", path).Warn("closing oracle tags file")
		}
	}()

	var tags []rawTag
	dec := json.NewDecoder(f)
	for dec.More() {
		var tag rawTag
		if err := dec.Decode(&tag); err != nil {
			return fmt.Errorf("reading oracle tags: %w", err)
		}
		tags = append(tags, tag)
	}
	setOracleTags(buildTagIndex(tags))
	return nil
}

// buildTagIndex resolves each tag's ancestors, gives every tagged card its
// tags with their ancestors, and counts the cards under each tag.
func buildTagIndex(tags []rawTag) tagIndex {
	// Ancestors are found by parent id, so index the tags by id first.
	byID := map[string]rawTag{}
	for _, tag := range tags {
		byID[tag.ID] = tag
	}

	idx := newTagIndex()
	cardTags := map[string]map[string]bool{}
	for _, tag := range tags {
		ancestors := tagAncestors(tag, byID)
		idx.bySlug[tag.Slug] = OracleTag{
			Slug:        tag.Slug,
			Label:       tag.Label,
			Description: tag.Description,
			Ancestors:   ancestors,
		}
		idx.byName[tagName(tag.Slug)] = tag.Slug
		idx.byName[tagName(tag.Label)] = tag.Slug
		for _, alias := range tag.Aliases {
			idx.byName[tagName(alias)] = tag.Slug
		}

		// A tagged card also carries every tag above this one.
		for _, tagging := range tag.Taggings {
			set := cardTags[tagging.OracleID]
			if set == nil {
				set = map[string]bool{}
				cardTags[tagging.OracleID] = set
			}
			set[tag.Slug] = true
			for _, ancestor := range ancestors {
				set[ancestor] = true
			}
		}
	}

	// Flatten each card's tag set to sorted slugs (HasRole binary-searches
	// them) and count the cards under each tag.
	for oracleID, set := range cardTags {
		slugs := make([]string, 0, len(set))
		for slug := range set {
			slugs = append(slugs, slug)
			info := idx.bySlug[slug]
			info.Cards++
			idx.bySlug[slug] = info
		}
		slices.Sort(slugs)
		idx.byOracleID[oracleID] = slugs
	}
	return idx
}

// tagAncestors returns the slugs of every tag above tag, sorted. Scryfall's
// tags form a graph where a tag can have several parents, so it walks all of
// them, visiting each once.
func tagAncestors(tag rawTag, byID map[string]rawTag) []string {
	visited := map[string]bool{}
	pending := slices.Clone(tag.ParentIDs)
	var slugs []string
	for len(pending) > 0 {
		id := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		if visited[id] {
			continue
		}
		visited[id] = true

		parent, ok := byID[id]
		if !ok {
			continue
		}
		slugs = append(slugs, parent.Slug)
		pending = append(pending, parent.ParentIDs...)
	}
	slices.Sort(slugs)
	return slugs
}

// tagName normalizes a tag spelling for lookup: lowercase, with spaces read
// as hyphens, so "Self Mill" and "self-mill" find the same tag.
func tagName(name string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(name)), " ", "-")
}

// OracleTagsFor returns the slugs of every tag on the card with this oracle
// id, ancestors included, sorted. The slice is shared, so callers must not
// change it. A card with no tags, or no tag data loaded, gives nil.
func OracleTagsFor(oracleID string) []string {
	return oracleTags.byOracleID[oracleID]
}

// LookupOracleTag finds a tag by its slug, label or one of its aliases,
// ignoring case and treating spaces as hyphens.
func LookupOracleTag(name string) (OracleTag, bool) {
	slug, ok := oracleTags.byName[tagName(name)]
	if !ok {
		return OracleTag{}, false
	}
	return oracleTags.bySlug[slug], true
}

// OracleTagCount returns how many tags are loaded. It is zero when
// data/oracle-tags.jsonl is missing.
func OracleTagCount() int {
	return len(oracleTags.bySlug)
}

// HasTag reports whether the card carries the tag named by a slug, label or
// alias, the way an otag: search reads it. An unknown tag matches no card.
func (c Card) HasTag(name string) bool {
	tag, ok := LookupOracleTag(strings.Trim(name, `"`))
	if !ok {
		return false
	}
	return c.HasRole(tag.Slug)
}
