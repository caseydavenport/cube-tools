package stats

import (
	"cmp"
	"math"
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

const (
	// minSignatureDecks is how many of a player's decks must play a card
	// before it can be one of their signature cards.
	minSignatureDecks = 3

	// signatureChance is the most a signature card's count may be explained by
	// chance. It's strict because each player has dozens of cards to check.
	signatureChance = 0.01

	// maxSignatureCards caps how many signature cards a player shows.
	maxSignatureCards = 5

	// mainColorShare is the share of a player's colored cards, in percent, a
	// color needs to count among their main colors.
	mainColorShare = 20.0
)

// PlayerTendencies is what a player tends to draft, for the Players page.
// Matches counts their matches with a result. ColorShares is each color's
// percent of their colored cards, and MainColors those with mainColorShare or
// more, in WUBRG order. ColorGap is the color where they differ most from the
// cube, nil without colored cards.
type PlayerTendencies struct {
	Matches        int                `json:"matches"`
	ColorShares    map[string]float64 `json:"color_shares"`
	MainColors     []string           `json:"main_colors"`
	ColorGap       *ColorGap          `json:"color_gap"`
	Archetypes     []NamedCount       `json:"archetypes"`
	Packages       []NamedCount       `json:"packages"`
	SignatureCards []SignatureCard    `json:"signature_cards"`
}

// NamedCount is how many of a player's decks had something, such as an
// archetype or a package built.
type NamedCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// ColorGap compares a player's share of one color with the cube's, both as
// percentages of colored mainboard cards.
type ColorGap struct {
	Color       string  `json:"color"`
	PlayerShare float64 `json:"player_share"`
	CubeShare   float64 `json:"cube_share"`
}

// SignatureCard is a card a player mainboards far more often than everyone
// else. Decks of Available are the player's decks that played it, out of
// those from drafts where it was in the cube; Others of OthersAvailable is the
// same for everyone else.
type SignatureCard struct {
	Name            string `json:"name"`
	Decks           int    `json:"decks"`
	Available       int    `json:"available"`
	Others          int    `json:"others"`
	OthersAvailable int    `json:"others_available"`
}

// cubeLists maps a draft ID to the card names its cube held. A draft missing
// from the map has no snapshot, so every card counts as available in it.
type cubeLists map[int]map[string]bool

// available reports whether the card was in the cube for the deck's draft.
func (c cubeLists) available(d *storage.Deck, card string) bool {
	cube, ok := c[d.Metadata.DraftID]
	if !ok {
		return true
	}
	return cube[card]
}

// signatureCandidate is one card's counts while signature cards are picked,
// with the chance of the player's count happening by luck.
type signatureCandidate struct {
	card   SignatureCard
	chance float64
}

// playerTendencies works out what the player with playerID tends to draft.
// mine are their decks; baseline is every deck in the page's date range,
// which gives the cube's color shares and, without the player's own decks,
// everyone else's rates for signature cards.
func playerTendencies(playerID int, mine, baseline []*storage.Deck, pkgs []design.PackageCards, cubes cubeLists) PlayerTendencies {
	var others []*storage.Deck
	for _, d := range baseline {
		if d.PlayerID != playerID {
			others = append(others, d)
		}
	}

	playerShares := colorShares(mine)
	return PlayerTendencies{
		Matches:        matchesWithResults(mine),
		ColorShares:    playerShares,
		MainColors:     mainColors(playerShares),
		ColorGap:       biggestColorGap(playerShares, colorShares(baseline)),
		Archetypes:     archetypeCounts(mine),
		Packages:       packageCounts(mine, pkgs),
		SignatureCards: signatureCards(mine, others, cubes),
	}
}

// matchesWithResults counts the decks' matches that have a result: a winner,
// or any games won, lost or drawn.
func matchesWithResults(decks []*storage.Deck) int {
	n := 0
	for _, d := range decks {
		for _, m := range d.Matches {
			if m.Winner != "" || m.Wins+m.Losses+m.Draws > 0 {
				n++
			}
		}
	}
	return n
}

// colorShares returns each color's share, in percent, of the decks' colored
// non-basic mainboard cards. A multicolor card counts toward each of its
// colors, so shares can add up to more than 100. Nil when there are none.
func colorShares(decks []*storage.Deck) map[string]float64 {
	counts := map[string]int{}
	colored := 0
	for _, d := range decks {
		for _, c := range d.Mainboard {
			if c.IsBasicLand() || len(c.Colors) == 0 {
				continue
			}
			colored++
			for _, color := range c.Colors {
				counts[color]++
			}
		}
	}
	if colored == 0 {
		return nil
	}
	shares := map[string]float64{}
	for _, color := range manaColors {
		shares[color] = round1(100 * float64(counts[color]) / float64(colored))
	}
	return shares
}

// mainColors lists, in WUBRG order, the colors with at least mainColorShare.
func mainColors(shares map[string]float64) []string {
	colors := []string{}
	for _, color := range manaColors {
		if shares[color] >= mainColorShare {
			colors = append(colors, color)
		}
	}
	return colors
}

// biggestColorGap finds the color whose player share differs most from the
// cube's, the first in WUBRG order on a tie. Nil when either side has no
// colored cards.
func biggestColorGap(player, cube map[string]float64) *ColorGap {
	if player == nil || cube == nil {
		return nil
	}
	var gap *ColorGap
	for _, color := range manaColors {
		diff := math.Abs(player[color] - cube[color])
		if gap == nil || diff > math.Abs(gap.PlayerShare-gap.CubeShare) {
			gap = &ColorGap{Color: color, PlayerShare: player[color], CubeShare: cube[color]}
		}
	}
	return gap
}

// archetypeCounts counts the decks' macro archetypes, most common first. Decks
// with none are skipped.
func archetypeCounts(decks []*storage.Deck) []NamedCount {
	counts := map[string]int{}
	for _, d := range decks {
		if d.MacroArchetype != "" {
			counts[d.MacroArchetype]++
		}
	}
	return sortedCounts(counts)
}

// packageCounts counts how many of the decks build each package, most built
// first, by the same rule the Packages page uses.
func packageCounts(decks []*storage.Deck, pkgs []design.PackageCards) []NamedCount {
	counts := map[string]int{}
	for _, d := range decks {
		deck := map[string]bool{}
		for _, name := range nonBasicMainboard(d) {
			deck[name] = true
		}
		for _, p := range pkgs {
			if p.BuiltBy(deck) {
				counts[p.Name]++
			}
		}
	}
	return sortedCounts(counts)
}

// sortedCounts turns a count map into a list, highest count first, then name.
func sortedCounts(counts map[string]int) []NamedCount {
	out := []NamedCount{}
	for name, n := range counts {
		out = append(out, NamedCount{Name: name, Count: n})
	}
	slices.SortFunc(out, func(a, b NamedCount) int {
		if a.Count != b.Count {
			return b.Count - a.Count
		}
		return cmp.Compare(a.Name, b.Name)
	})
	return out
}

// signatureCards picks the cards the player mainboards much more often than
// others did. A card needs minSignatureDecks of the player's decks, and the
// chance of that many at everyone else's rate must be under signatureChance.
// Only decks from drafts whose cube had the card count. Lowest chance first,
// at most maxSignatureCards.
func signatureCards(mine, others []*storage.Deck, cubes cubeLists) []SignatureCard {
	candidates := []signatureCandidate{}
	for card := range cardsInAtLeast(mine, minSignatureDecks) {
		decks, available := countWithCard(mine, card, cubes)
		if decks < minSignatureDecks {
			continue
		}
		otherDecks, otherAvailable := countWithCard(others, card, cubes)

		// One added to each side keeps a card nobody else played from
		// reading as impossible for anyone else.
		otherRate := float64(otherDecks+1) / float64(otherAvailable+2)
		chance := binomialTail(decks, available, otherRate)
		if chance >= signatureChance {
			continue
		}
		candidates = append(candidates, signatureCandidate{
			card:   SignatureCard{Name: card, Decks: decks, Available: available, Others: otherDecks, OthersAvailable: otherAvailable},
			chance: chance,
		})
	}

	slices.SortFunc(candidates, func(a, b signatureCandidate) int {
		if a.chance != b.chance {
			return cmp.Compare(a.chance, b.chance)
		}
		return cmp.Compare(a.card.Name, b.card.Name)
	})
	out := []SignatureCard{}
	for i := 0; i < len(candidates) && i < maxSignatureCards; i++ {
		out = append(out, candidates[i].card)
	}
	return out
}

// cardsInAtLeast returns the non-basic mainboard cards that appear in at least
// n of the decks.
func cardsInAtLeast(decks []*storage.Deck, n int) map[string]bool {
	counts := map[string]int{}
	for _, d := range decks {
		for name := range distinctSpells(d) {
			counts[name]++
		}
	}
	out := map[string]bool{}
	for name, count := range counts {
		if count >= n {
			out[name] = true
		}
	}
	return out
}

// countWithCard counts, among the decks from drafts whose cube had the card,
// how many mainboarded it and how many there were.
func countWithCard(decks []*storage.Deck, card string, cubes cubeLists) (int, int) {
	with, available := 0, 0
	for _, d := range decks {
		if !cubes.available(d, card) {
			continue
		}
		available++
		if distinctSpells(d)[card] {
			with++
		}
	}
	return with, available
}

// distinctSpells is the set of a deck's non-basic mainboard card names.
func distinctSpells(d *storage.Deck) map[string]bool {
	names := map[string]bool{}
	for _, name := range nonBasicMainboard(d) {
		names[name] = true
	}
	return names
}

// binomialTail is the chance of k or more successes in n tries that each
// succeed with probability p. It sums in log space so large n doesn't
// overflow the binomial coefficients.
func binomialTail(k, n int, p float64) float64 {
	if k <= 0 {
		return 1
	}
	if k > n {
		return 0
	}
	total := 0.0
	for i := k; i <= n; i++ {
		total += math.Exp(logChoose(n, i) + float64(i)*math.Log(p) + float64(n-i)*math.Log1p(-p))
	}
	return total
}

// logChoose is the natural log of n choose k.
func logChoose(n, k int) float64 {
	a, _ := math.Lgamma(float64(n + 1))
	b, _ := math.Lgamma(float64(k + 1))
	c, _ := math.Lgamma(float64(n - k + 1))
	return a - b - c
}
