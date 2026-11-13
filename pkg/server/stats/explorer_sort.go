package stats

import (
	"cmp"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server/query"
)

// defaultExplorerLimit is how many rows of each table the explorer sends when
// the page doesn't ask for more.
const defaultExplorerLimit = 100

// explorerSort is the column the explorer's tables sort by and its direction.
type explorerSort struct {
	key  string
	desc bool
}

// explorerSortKeys are the columns the tables sort by, each mapped to the
// card's value under it. Name sorts as text; the rest are numbers.
var explorerSortKeys = map[string]func(ExplorerCard) float64{
	"fills":       func(c ExplorerCard) float64 { return c.FillsGaps },
	"mv":          func(c ExplorerCard) float64 { return float64(c.CMC) },
	"groups":      func(c ExplorerCard) float64 { return float64(len(c.Groups)) },
	"packages":    func(c ExplorerCard) float64 { return float64(packageCount(c)) },
	"linked":      func(c ExplorerCard) float64 { return float64(linkedCount(c)) },
	"connections": func(c ExplorerCard) float64 { return float64(len(c.Connections)) },
}

// sortParams reads "sort" and "dir". An unknown column sorts by Uniqueness,
// and a column without a direction sorts high to low, except Name, A to Z.
func sortParams(r *http.Request) explorerSort {
	key := query.GetString(r, "sort")
	if _, ok := explorerSortKeys[key]; !ok && key != "name" {
		key = "fills"
	}
	desc := key != "name"
	switch query.GetString(r, "dir") {
	case "asc":
		desc = false
	case "desc":
		desc = true
	}
	return explorerSort{key: key, desc: desc}
}

// limitParam reads "limit", the rows to send per table.
func limitParam(r *http.Request) int {
	limit, err := strconv.Atoi(query.GetString(r, "limit"))
	if err != nil || limit <= 0 {
		return defaultExplorerLimit
	}
	return limit
}

// sortExplorerCards orders cards by the sort's column, ties by name.
func sortExplorerCards(cards []ExplorerCard, s explorerSort) {
	value := explorerSortKeys[s.key]
	slices.SortFunc(cards, func(a, b ExplorerCard) int {
		var order int
		if value != nil {
			order = cmp.Compare(value(a), value(b))
		} else {
			order = strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
		}
		if s.desc {
			order = -order
		}
		if order != 0 {
			return order
		}
		return strings.Compare(a.Name, b.Name)
	})
}

// packageCount is how many distinct packages a card joins.
func packageCount(c ExplorerCard) int {
	seen := map[string]bool{}
	for _, j := range c.Joins {
		seen[j.Package] = true
	}
	return len(seen)
}

// linkedCount is how many things a card would pair with: its linked cube
// cards, plus basic lands as one more when a wire wants them.
func linkedCount(c ExplorerCard) int {
	if c.LinkedBasics {
		return len(c.Linked) + 1
	}
	return len(c.Linked)
}
