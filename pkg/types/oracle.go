package types

import (
	"encoding/json"
	"io/ioutil"
	"os"
	"strings"
)

var oracleCards map[string]OracleCard

func init() {
	// Load the oracle data from disk and build a lookup table,
	// so that we can quickly find card information when parsing decks.
	oracleCards = make(map[string]OracleCard, 0)
	f, err := os.Open("./data/oracle-cards.json")
	defer f.Close()
	if err != nil {
		panic(err)
	}
	bytes, err := ioutil.ReadAll(f)
	if err != nil {
		panic(err)
	}
	oracleList := OracleData{}
	err = json.Unmarshal(bytes, &oracleList)
	if err != nil {
		panic(err)
	}
	for _, card := range oracleList {
		// Skip tokens. Sometimes they have the same name
		// as real cards, but they never actually belong in a deck.
		if strings.Contains(card.TypeLine, "Token") {
			continue
		}
		oracleCards[card.Name] = card
	}
}

func GetOracleData(name string) OracleCard {
	return oracleCards[name]
}

type OracleData []OracleCard

//	{
//	  "object": "card",
//	  "id": "86bf43b1-8d4e-4759-bb2d-0b2e03ba7012",
//	  "oracle_id": "0004ebd0-dfd6-4276-b4a6-de0003e94237",
//	  "multiverse_ids": [
//	    15862
//	  ],
//	  "mtgo_id": 15870,
//	  "mtgo_foil_id": 15871,
//	  "tcgplayer_id": 3094,
//	  "cardmarket_id": 3081,
//	  "name": "Static Orb",
//	  "lang": "en",
//	  "released_at": "2001-04-11",
//	  "uri": "https://api.scryfall.com/cards/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012",
//	  "scryfall_uri": "https://scryfall.com/card/7ed/319/static-orb?utm_source=api",
//	  "layout": "normal",
//	  "highres_image": true,
//	  "image_status": "highres_scan",
//	  "image_uris": {
//	    "small": "https://cards.scryfall.io/small/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.jpg?1562242171",
//	    "normal": "https://cards.scryfall.io/normal/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.jpg?1562242171",
//	    "large": "https://cards.scryfall.io/large/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.jpg?1562242171",
//	    "png": "https://cards.scryfall.io/png/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.png?1562242171",
//	    "art_crop": "https://cards.scryfall.io/art_crop/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.jpg?1562242171",
//	    "border_crop": "https://cards.scryfall.io/border_crop/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.jpg?1562242171"
//	  },
//	  "mana_cost": "{3}",
//	  "cmc": 3,
//	  "type_line": "Artifact",
//	  "oracle_text": "As long as Static Orb is untapped, players can't untap more than two permanents during their untap steps.",
//	  "colors": [],
//	  "color_identity": [],
//	  "keywords": [],
//	  "legalities": {
//	    "standard": "not_legal",
//	    "future": "not_legal",
//	    "historic": "not_legal",
//	    "gladiator": "not_legal",
//	    "pioneer": "not_legal",
//	    "explorer": "not_legal",
//	    "modern": "not_legal",
//	    "legacy": "legal",
//	    "pauper": "not_legal",
//	    "vintage": "legal",
//	    "penny": "not_legal",
//	    "commander": "legal",
//	    "oathbreaker": "legal",
//	    "brawl": "not_legal",
//	    "historicbrawl": "not_legal",
//	    "alchemy": "not_legal",
//	    "paupercommander": "not_legal",
//	    "duel": "legal",
//	    "oldschool": "not_legal",
//	    "premodern": "legal",
//	    "predh": "legal"
//	  },
//	  "games": [
//	    "paper",
//	    "mtgo"
//	  ],
//	  "reserved": false,
//	  "foil": false,
//	  "nonfoil": true,
//	  "finishes": [
//	    "nonfoil"
//	  ],
//	  "oversized": false,
//	  "promo": false,
//	  "reprint": true,
//	  "variation": false,
//	  "set_id": "230f38aa-9511-4db8-a3aa-aeddbc3f7bb9",
//	  "set": "7ed",
//	  "set_name": "Seventh Edition",
//	  "set_type": "core",
//	  "set_uri": "https://api.scryfall.com/sets/230f38aa-9511-4db8-a3aa-aeddbc3f7bb9",
//	  "set_search_uri": "https://api.scryfall.com/cards/search?order=set&q=e%3A7ed&unique=prints",
//	  "scryfall_set_uri": "https://scryfall.com/sets/7ed?utm_source=api",
//	  "rulings_uri": "https://api.scryfall.com/cards/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012/rulings",
//	  "prints_search_uri": "https://api.scryfall.com/cards/search?order=released&q=oracleid%3A0004ebd0-dfd6-4276-b4a6-de0003e94237&unique=prints",
//	  "collector_number": "319",
//	  "digital": false,
//	  "rarity": "rare",
//	  "flavor_text": "The warriors fought against the paralyzing waves until even their thoughts froze in place.",
//	  "card_back_id": "0aeebaf5-8c7d-4636-9e82-8c27447861f7",
//	  "artist": "Terese Nielsen",
//	  "artist_ids": [
//	    "eb55171c-2342-45f4-a503-2d5a75baf752"
//	  ],
//	  "illustration_id": "6f8b3b2c-252f-4f95-b621-712c82be38b5",
//	  "border_color": "white",
//	  "frame": "1997",
//	  "full_art": false,
//	  "textless": false,
//	  "booster": true,
//	  "story_spotlight": false,
//	  "edhrec_rank": 3156,
//	  "prices": {
//	    "usd": "21.70",
//	    "usd_foil": null,
//	    "usd_etched": null,
//	    "eur": "12.99",
//	    "eur_foil": null,
//	    "tix": "0.20"
//	  },
//	  "related_uris": {
//	    "gatherer": "https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=15862",
//	    "tcgplayer_infinite_articles": "https://infinite.tcgplayer.com/search?contentMode=article&game=magic&partner=scryfall&q=Static+Orb&utm_campaign=affiliate&utm_medium=api&utm_source=scryfall",
//	    "tcgplayer_infinite_decks": "https://infinite.tcgplayer.com/search?contentMode=deck&game=magic&partner=scryfall&q=Static+Orb&utm_campaign=affiliate&utm_medium=api&utm_source=scryfall",
//	    "edhrec": "https://edhrec.com/route/?cc=Static+Orb"
//	  }
//	}
type OracleCard struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	ScryfallURI string            `json:"scryfall_uri"`
	ImageURLs   map[string]string `json:"image_urls"`
	ManaCost    string            `json:"mana_cost"`
	CMC         float64           `json:"cmc"`
	TypeLine    string            `json:"type_line"`
	OracleText  string            `json:"oracle_text"`
	Colors      []string          `json:"colors"`
	Keywords    []string          `json:"keywords"`
	RelatedURLs map[string]string `json:"related_ur_ls"`
}
