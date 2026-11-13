package stats

import (
	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// draftIDsOf returns the distinct drafts the decks came from.
func draftIDsOf(decks []*storage.Deck) []int {
	seen := map[int]bool{}
	var out []int
	for _, d := range decks {
		id := d.Metadata.DraftID
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// relevantConfig returns the rules with only the packages keep accepts, by
// their relevance, so a view built from the config shows only those. Every
// group stays.
func (in designInputs) relevantConfig(keep func(*design.Relevance) bool) design.DesignMapConfig {
	return configFor(in.config, keepPackages(in.packages(), keep))
}

// keepPackages returns the resolved packages keep accepts, by relevance.
func keepPackages(pkgs []design.PackageCards, keep func(*design.Relevance) bool) []design.PackageCards {
	var out []design.PackageCards
	for _, p := range pkgs {
		if keep(p.Relevance) {
			out = append(out, p)
		}
	}
	return out
}

// configFor returns config with only the packages already resolved in pkgs,
// so a view can use both without resolving the rules a second time.
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
