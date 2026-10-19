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

func TestCubeInfoHandlerReportsWritable(t *testing.T) {
	store := memory.NewStore(func(b *memory.Backend) { b.SetReadOnly("cc:abc") })
	handler := server.CubeInfoHandler(store)
	for cube, want := range map[string]string{
		"polyverse": `{"writable":true}`,
		"cc:abc":    `{"writable":false}`,
	} {
		r := httptest.NewRequest(http.MethodGet, "/api/"+cube+"/info", nil)
		r = r.WithContext(server.ContextWithCube(context.Background(), cube))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, r)
		assert.Equal(t, http.StatusOK, rec.Code, cube)
		assert.JSONEq(t, want, rec.Body.String(), cube)
	}
}
