package commands

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestParseDeckBytesTXT(t *testing.T) {
	if err := types.LoadOracleData("testdata/oracle-mini.json"); err != nil {
		t.Fatalf("load oracle fixture: %v", err)
	}
	in := []byte("2 Plains\n1 Monastery Mentor\n\n1 Snapcaster Mage\n")
	mb, sb, err := ParseDeckBytes(in, ".txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mb) != 3 {
		t.Fatalf("mainboard: want 3 cards, got %d", len(mb))
	}
	if len(sb) != 1 {
		t.Fatalf("sideboard: want 1 card, got %d", len(sb))
	}
}

func TestParseDeckBytesCSVQuantity(t *testing.T) {
	if err := types.LoadOracleData("testdata/oracle-mini.json"); err != nil {
		t.Fatalf("load oracle fixture: %v", err)
	}
	in := []byte("Name,Quantity\nPlains,3\nSnapcaster Mage,1\n")
	mb, _, err := ParseDeckBytes(in, ".csv")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mb) != 4 {
		t.Fatalf("mainboard: want 4 cards, got %d", len(mb))
	}
}

func TestParseDeckBytesUnknownFormat(t *testing.T) {
	if _, _, err := ParseDeckBytes([]byte("x"), ".pdf"); err == nil {
		t.Fatal("expected error for unsupported format")
	}
}
