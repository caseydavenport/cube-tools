package ocr

import (
	"encoding/json"
	"net/http"
	"strings"
)

// validDraftID rejects empty ids and anything that could escape the data dir
// (path separators or "..") - draft ids land directly in filesystem paths.
func validDraftID(id string) bool {
	return id != "" && !strings.ContainsAny(id, `/\`) && !strings.Contains(id, "..")
}

// writeJSON encodes v as indented JSON to the response. Encode errors are
// ignored: by the time encoding fails the status line is already sent, so
// there's nothing useful left to tell the client.
func writeJSON(rw http.ResponseWriter, v any) {
	rw.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(rw)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}
