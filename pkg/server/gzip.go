package server

import (
	"compress/gzip"
	"net/http"
	"strings"

	"github.com/sirupsen/logrus"
)

// Gzip compresses responses for clients that accept gzip. The API's JSON is
// highly repetitive (a cube's deck list runs to megabytes), so this cuts what
// browsers download several times over. Photo routes are passed through as
// is, since images are already compressed.
func Gzip(h http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		// Caches must keep the compressed and plain versions apart.
		rw.Header().Add("Vary", "Accept-Encoding")

		if !acceptsGzip(r) || strings.Contains(r.URL.Path, "/img/") {
			h.ServeHTTP(rw, r)
			return
		}

		w := &gzipResponseWriter{ResponseWriter: rw, status: http.StatusOK}
		h.ServeHTTP(w, r)
		w.finish(r.URL.Path)
	})
}

// acceptsGzip reports whether the request's Accept-Encoding lists gzip.
func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		encoding, _, _ := strings.Cut(strings.TrimSpace(part), ";")
		if encoding == "gzip" {
			return true
		}
	}
	return false
}

// gzipResponseWriter sends a handler's body through a gzip writer. It holds the
// status until the first body bytes arrive, so a response with no body (like a
// 204) goes out plain rather than as an empty gzip stream.
type gzipResponseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	gz          *gzip.Writer
}

// WriteHeader records the status; it's sent with the first body bytes, or by
// finish if there are none.
func (w *gzipResponseWriter) WriteHeader(status int) {
	if !w.wroteHeader {
		w.status = status
		w.wroteHeader = true
	}
}

// Write starts the gzip stream on the first call: it marks the response as
// gzip-encoded, drops any Content-Length (which would describe the plain body),
// and sends the status. Then it compresses the bytes.
func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	if w.gz == nil {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Del("Content-Length")
		w.ResponseWriter.WriteHeader(w.status)
		w.gz = gzip.NewWriter(w.ResponseWriter)
	}
	return w.gz.Write(b)
}

// finish ends the response after the handler returns: it closes the gzip
// stream if a body was written, or sends the bare status if not.
func (w *gzipResponseWriter) finish(path string) {
	if w.gz == nil {
		w.ResponseWriter.WriteHeader(w.status)
		return
	}
	if err := w.gz.Close(); err != nil {
		logrus.WithError(err).WithField("path", path).Warn("Failed to finish gzip response")
	}
}
