package importer

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// maxPhotoUpload caps the whole import request body. Deck photos run a couple MB
// each, so this holds a large draft without letting an upload run away.
const maxPhotoUpload = 256 << 20

// photoFormMemory is how much of an upload ParseMultipartForm keeps in memory
// before spilling the rest to temp files.
const photoFormMemory = 32 << 20

// photoUploadExts are the lowercase file extensions staged as deck photos.
var photoUploadExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
}

// PhotoImportHandler builds an OCR-ready draft directory from uploaded deck
// photos (one per player) and returns the local draft id the UI opens in the
// OCR flow. The request is a multipart form: the image files under "images"
// plus the date, slug, event_name, and flight fields. src supplies the live
// cube list, saved with the draft as its snapshot.
func PhotoImportHandler(src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}

		r.Body = http.MaxBytesReader(rw, r.Body, maxPhotoUpload)
		if err := r.ParseMultipartForm(photoFormMemory); err != nil {
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
		defer removeAll(tmp)

		// The live list is the one this draft was just played with.
		cl, err := src.Refresh(cube)
		if err != nil {
			logrus.WithError(err).WithField("cube", cube).Error("could not fetch the cube list for a photo import")
			http.Error(rw, "could not fetch the cube list", http.StatusServiceUnavailable)
			return
		}

		draftID, err := commands.BuildPhotoDraft(cube, cl, tmp, date, slug, r.FormValue("event_name"), r.FormValue("flight"))
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
			removeAll(tmp)
			return "", err
		}
	}
	return tmp, nil
}

// removeAll deletes a staging directory, logging a failure since the request
// is already answered by then.
func removeAll(dir string) {
	if err := os.RemoveAll(dir); err != nil {
		logrus.WithError(err).WithField("dir", dir).Warn("could not remove photo upload staging directory")
	}
}

// saveUpload copies one multipart file to dst. The destination's Close error
// is returned, since a failed close can mean the last bytes never reached disk.
func saveUpload(fh *multipart.FileHeader, dst string) error {
	src, err := fh.Open()
	if err != nil {
		return fmt.Errorf("open upload %s: %w", fh.Filename, err)
	}
	defer func() {
		if closeErr := src.Close(); closeErr != nil {
			logrus.WithError(closeErr).WithField("file", fh.Filename).Warn("could not close upload")
		}
	}()
	out, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("write upload %s: %w", fh.Filename, err)
	}
	if _, err := io.Copy(out, src); err != nil {
		if closeErr := out.Close(); closeErr != nil {
			logrus.WithError(closeErr).WithField("file", fh.Filename).Warn("could not close partial upload")
		}
		return fmt.Errorf("write upload %s: %w", fh.Filename, err)
	}
	if err := out.Close(); err != nil {
		return fmt.Errorf("write upload %s: %w", fh.Filename, err)
	}
	return nil
}
