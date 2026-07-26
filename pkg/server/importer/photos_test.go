package importer

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

// photoForm builds a multipart body: fields plus image parts keyed "images".
func photoForm(t *testing.T, fields map[string]string, images map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	for name, content := range images {
		part, err := w.CreateFormFile("images", name)
		if err != nil {
			t.Fatal(err)
		}
		part.Write([]byte(content))
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, w.FormDataContentType()
}

func postPhotos(t *testing.T, cube string, fields, images map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	body, contentType := photoForm(t, fields, images)
	req := httptest.NewRequest(http.MethodPost, "/api/"+cube+"/import/photos", body)
	req.Header.Set("Content-Type", contentType)
	req = req.WithContext(server.ContextWithCube(req.Context(), cube))
	rw := httptest.NewRecorder()
	PhotoImportHandler().ServeHTTP(rw, req)
	return rw
}

func TestPhotoImportHandlerValidation(t *testing.T) {
	// Missing date, missing slug, and no images each fail before any build.
	cases := []struct {
		name   string
		fields map[string]string
		images map[string]string
	}{
		{"no date", map[string]string{"slug": "evt"}, map[string]string{"a.jpg": "x"}},
		{"no slug", map[string]string{"date": "2026-06-20"}, map[string]string{"a.jpg": "x"}},
		{"no images", map[string]string{"date": "2026-06-20", "slug": "evt"}, nil},
	}
	for _, c := range cases {
		rw := postPhotos(t, "aurora", c.fields, c.images)
		if rw.Code != http.StatusBadRequest {
			t.Fatalf("%s: status %d, want 400 (%s)", c.name, rw.Code, rw.Body.String())
		}
	}
}

func TestPhotoImportHandlerNotMultipart(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/aurora/import/photos", bytes.NewReader([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(server.ContextWithCube(req.Context(), "aurora"))
	rw := httptest.NewRecorder()
	PhotoImportHandler().ServeHTTP(rw, req)
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rw.Code)
	}
}

// stagePhotoUploads keeps only image files, strips any directory a filename
// smuggles in, and never writes outside the temp dir.
func TestStagePhotoUploads(t *testing.T) {
	body, contentType := photoForm(t, nil, map[string]string{
		"b.jpg":        "x",
		"a.PNG":        "x",
		"notes.txt":    "x",
		"../evil.jpeg": "x",
	})
	req := httptest.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", contentType)
	if err := req.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}

	tmp, err := stagePhotoUploads(req.MultipartForm.File["images"])
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmp)

	entries, err := os.ReadDir(tmp)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, e := range entries {
		got = append(got, e.Name())
	}
	sort.Strings(got)
	// notes.txt dropped (not an image); ../evil.jpeg lands as evil.jpeg inside tmp.
	want := []string{"a.PNG", "b.jpg", "evil.jpeg"}
	if len(got) != len(want) {
		t.Fatalf("staged %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("staged %v, want %v", got, want)
		}
	}
	// The smuggled path must not have escaped the temp dir.
	if _, err := os.Stat(filepath.Join(tmp, "..", "evil.jpeg")); err == nil {
		t.Fatal("upload escaped the temp dir")
	}
}
