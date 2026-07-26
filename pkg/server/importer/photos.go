package importer

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server"
)

// maxPhotoUpload caps the whole import request body. Deck photos run a couple MB
// each, so this holds a large draft without letting an upload run away.
const maxPhotoUpload = 256 << 20

var photoUploadExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
}

// PhotoImportHandler builds an OCR-ready draft directory from uploaded deck
// photos (one per player) and returns the local draft id the UI opens in the
// OCR flow. The request is a multipart form: the image files under "images"
// plus the date, slug, event_name, and flight fields.
func PhotoImportHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}

		r.Body = http.MaxBytesReader(rw, r.Body, maxPhotoUpload)
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			http.Error(rw, fmt.Sprintf("read upload: %v", err), http.StatusBadRequest)
			return
		}

		date := r.FormValue("date")
		slug := r.FormValue("slug")
		if date == "" || slug == "" {
			http.Error(rw, "date and slug are required", http.StatusBadRequest)
			return
		}
		if len(r.MultipartForm.File["images"]) == 0 {
			http.Error(rw, "no images uploaded", http.StatusBadRequest)
			return
		}

		tmp, err := stagePhotoUploads(r.MultipartForm.File["images"])
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		defer os.RemoveAll(tmp)

		draftID, err := commands.BuildPhotoDraft(cube, tmp, date, slug, r.FormValue("event_name"), r.FormValue("flight"))
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(rw, map[string]any{"draft_id": draftID})
	})
}

// stagePhotoUploads writes the uploaded image files to a fresh temp dir under
// their base filenames and returns the dir for the folder builder to consume.
// Non-image uploads are skipped, and filepath.Base strips any directory a
// client smuggles into a filename so an upload can't escape the temp dir. The
// caller owns removing the dir.
func stagePhotoUploads(files []*multipart.FileHeader) (string, error) {
	tmp, err := os.MkdirTemp("", "photo-import-*")
	if err != nil {
		return "", fmt.Errorf("stage upload: %w", err)
	}
	for _, fh := range files {
		name := filepath.Base(fh.Filename)
		if !photoUploadExts[strings.ToLower(filepath.Ext(name))] {
			continue
		}
		if err := saveUpload(fh, filepath.Join(tmp, name)); err != nil {
			os.RemoveAll(tmp)
			return "", err
		}
	}
	return tmp, nil
}

// saveUpload copies one multipart file to dst.
func saveUpload(fh *multipart.FileHeader, dst string) error {
	src, err := fh.Open()
	if err != nil {
		return fmt.Errorf("open upload %s: %w", fh.Filename, err)
	}
	defer src.Close()
	out, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("write upload %s: %w", fh.Filename, err)
	}
	defer out.Close()
	if _, err := io.Copy(out, src); err != nil {
		return fmt.Errorf("write upload %s: %w", fh.Filename, err)
	}
	return nil
}
