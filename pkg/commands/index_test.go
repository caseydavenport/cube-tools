package commands

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIndexMissingCubeReturnsError(t *testing.T) {
	// Point the working dir somewhere with no data/<cube> tree; Index should
	// return an error rather than exit the process.
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "data", "nope"), 0o755); err != nil {
		t.Fatal(err)
	}
	// cube.json is absent, so GenerateCubeJSON fails and Index returns non-nil.
	cwd, _ := os.Getwd()
	defer os.Chdir(cwd)
	os.Chdir(dir)
	if err := Index("nope"); err == nil {
		t.Fatal("expected error when cube.json is missing")
	}
}
