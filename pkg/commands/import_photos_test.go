package commands

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestScanPhotoFolder(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "b.jpg"))
	writeFile(t, filepath.Join(dir, "a.JPG"))
	writeFile(t, filepath.Join(dir, "c.png"))
	writeFile(t, filepath.Join(dir, "notes.txt"))
	writeFile(t, filepath.Join(dir, "sub", "d.jpg"))

	got, err := ScanPhotoFolder(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"a.JPG", "b.jpg", "c.png"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestScanPhotoFolderErrors(t *testing.T) {
	if _, err := ScanPhotoFolder(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("expected error for missing dir")
	}
	f := filepath.Join(t.TempDir(), "file.jpg")
	writeFile(t, f)
	if _, err := ScanPhotoFolder(f); err == nil {
		t.Fatal("expected error for non-directory")
	}
}

func TestBuildPhotoDraftDir(t *testing.T) {
	root := t.TempDir()
	src := t.TempDir()
	writeFile(t, filepath.Join(src, "img_2.jpg"))
	writeFile(t, filepath.Join(src, "img_1.png"))

	// An existing draft, so the new one takes the next id.
	if _, err := drafts.Create(filepath.Join(root, "aurora"), types.DraftMetadata{ID: 0, Date: "2026-01-01"}); err != nil {
		t.Fatal(err)
	}

	draft, imgs, err := buildPhotoDraftDir(root, "aurora", src, "2026-06-20", "evt", "My Event", "Sat AM")
	if err != nil {
		t.Fatal(err)
	}
	if draft.ID != 2 || draft.Dir != filepath.Join(root, "aurora", "0002_2026-06-20") {
		t.Fatalf("draft = %+v, want id 2 in 0002_2026-06-20", draft)
	}
	if len(imgs) != 2 {
		t.Fatalf("wrote %d images, want 2", len(imgs))
	}

	meta, err := types.LoadDraftMetadata(draft.Dir)
	if err != nil {
		t.Fatal(err)
	}
	want := types.DraftMetadata{ID: 2, Date: "2026-06-20", EventName: "My Event", EventCode: "evt", Flight: "Sat AM"}
	if *meta != want {
		t.Fatalf("metadata = %+v, want %+v", *meta, want)
	}

	// p1 gets img_1.png (sorted), p2 gets img_2.jpg; extension preserved.
	if _, err := os.Stat(filepath.Join(draft.Dir, "img", "p1", "deck-1.png")); err != nil {
		t.Fatalf("p1 image: %v", err)
	}
	if _, err := os.Stat(filepath.Join(draft.Dir, "img", "p2", "deck-1.jpg")); err != nil {
		t.Fatalf("p2 image: %v", err)
	}

	deck, err := types.LoadDeck(filepath.Join(draft.Dir, "1.json"))
	if err != nil {
		t.Fatal(err)
	}
	if deck.ID != 1 || deck.Player != "0002-p1" || deck.Date != "2026-06-20" || deck.Metadata.DraftID != 2 {
		t.Fatalf("bad stub: id=%d player=%q date=%q draft=%d", deck.ID, deck.Player, deck.Date, deck.Metadata.DraftID)
	}
}

func TestBuildPhotoDraftDirErrors(t *testing.T) {
	root := t.TempDir()
	src := t.TempDir()
	writeFile(t, filepath.Join(src, "a.jpg"))

	// bad slug
	if _, _, err := buildPhotoDraftDir(root, "aurora", src, "2026-06-20", "Bad_Slug", "", ""); err == nil {
		t.Fatal("expected slug error")
	}
	// bad date
	if _, _, err := buildPhotoDraftDir(root, "aurora", src, "06/20/2026", "evt", "", ""); err == nil {
		t.Fatal("expected date error")
	}
	// no images
	if _, _, err := buildPhotoDraftDir(root, "aurora", t.TempDir(), "2026-06-20", "evt", "", ""); err == nil {
		t.Fatal("expected no-images error")
	}
	// nonexistent source path
	if _, _, err := buildPhotoDraftDir(root, "aurora", filepath.Join(t.TempDir(), "nope"), "2026-06-20", "evt", "", ""); err == nil {
		t.Fatal("expected error for missing source path")
	}
}
