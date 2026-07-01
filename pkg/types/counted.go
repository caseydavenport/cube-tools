package types

// CountedCard is one card name with a copy count.
type CountedCard struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// ExpandCounted turns counted cards into a hydrated card slice, one entry per
// copy.
func ExpandCounted(cards []CountedCard) []Card {
	out := make([]Card, 0)
	for _, c := range cards {
		for i := 0; i < c.Count; i++ {
			out = append(out, HydrateCard(c.Name))
		}
	}
	return out
}

// DeriveSideboard returns the pool multiset minus the played non-basic
// mainboard multiset, per name, floored at zero.
func DeriveSideboard(pool, mainboard []CountedCard) []Card {
	played := map[string]int{}
	for _, c := range mainboard {
		if !IsBasic(c.Name) {
			played[c.Name] += c.Count
		}
	}
	out := make([]Card, 0)
	for _, c := range pool {
		remaining := c.Count - played[c.Name]
		for i := 0; i < remaining; i++ {
			out = append(out, HydrateCard(c.Name))
		}
	}
	return out
}
