package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage/file"
)

func TestCubeIndexHandlerEmptyCube(t *testing.T) {
	t.Chdir(t.TempDir())
	handler := server.CubeIndexHandler(file.NewStore(nil))

	r := httptest.NewRequest(http.MethodGet, "/api/empty/index", nil)
	r = r.WithContext(server.ContextWithCube(context.Background(), "empty"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, r)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"drafts":[]}`, rec.Body.String())
}
