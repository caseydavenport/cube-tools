package importer

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestPhotoScanHandler(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"a.jpg", "b.png", "c.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	rw := postJSON(t, PhotoScanHandler(), "aurora", "/api/aurora/import/photos/scan", PhotoScanRequest{SourcePath: dir})
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}
	var got struct {
		Images []string `json:"images"`
		Count  int      `json:"count"`
	}
	if err := json.Unmarshal(rw.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Count != 2 || len(got.Images) != 2 {
		t.Fatalf("got %+v", got)
	}
}

func TestPhotoScanHandlerBadPath(t *testing.T) {
	rw := postJSON(t, PhotoScanHandler(), "aurora", "/api/aurora/import/photos/scan", PhotoScanRequest{SourcePath: filepath.Join(t.TempDir(), "nope")})
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rw.Code)
	}
}

func TestPhotoImportHandlerValidation(t *testing.T) {
	cases := []PhotoImportRequest{
		{SourcePath: "/x", Date: "2026-06-20"},
		{SourcePath: "/x", Slug: "evt"},
		{Date: "2026-06-20", Slug: "evt"},
	}
	for i, c := range cases {
		rw := postJSON(t, PhotoImportHandler(), "aurora", "/api/aurora/import/photos", c)
		if rw.Code != http.StatusBadRequest {
			t.Fatalf("case %d: status %d, want 400", i, rw.Code)
		}
	}
}
