package file

import (
	"os"
	"testing"
)

// BenchmarkGetSnapshot reads one Polyverse draft's snapshot, as each package
// request does for every draft.
func BenchmarkGetSnapshot(b *testing.B) {
	if _, err := os.Stat("data/polyverse"); err != nil {
		b.Chdir("../../..")
	}
	backend := New(nil)
	b.ReportAllocs()
	for b.Loop() {
		if _, err := backend.GetSnapshot("polyverse", 30); err != nil {
			b.Fatal(err)
		}
	}
}
