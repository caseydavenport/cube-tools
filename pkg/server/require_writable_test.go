package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
)

// requireWritableCase is one cube the guard is exercised against.
type requireWritableCase struct {
	cube       string
	wantStatus int
	wantCalled bool
}

func TestRequireWritable(t *testing.T) {
	store := memory.NewStore(func(b *memory.Backend) { b.SetReadOnly("cc:abc") })
	cases := []requireWritableCase{
		{cube: "polyverse", wantStatus: http.StatusOK, wantCalled: true},
		{cube: "cc:abc", wantStatus: http.StatusForbidden, wantCalled: false},
	}
	for _, c := range cases {
		called := false
		handler := server.RequireWritable(store, http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			called = true
			rw.WriteHeader(http.StatusOK)
		}))
		r := httptest.NewRequest(http.MethodPost, "/api/"+c.cube+"/import/commit", nil)
		r = r.WithContext(server.ContextWithCube(context.Background(), c.cube))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, r)
		assert.Equal(t, c.wantStatus, rec.Code, c.cube)
		assert.Equal(t, c.wantCalled, called, c.cube)
	}
}
