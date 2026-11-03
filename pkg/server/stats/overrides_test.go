package stats

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
)

func TestOverridesHandler_RoundTrip(t *testing.T) {
	store := memory.NewStore(func(*memory.Backend) {})
	rec := serve(t, SaveOverridesHandler(store), http.MethodPost, "/api/testcube/package-overrides", `{"on":["Cauldron"],"off":["Snow"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = serve(t, GetOverridesHandler(store), http.MethodGet, "/api/testcube/package-overrides", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var got design.PackageOverrides
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	assert.Equal(t, design.PackageOverrides{On: []string{"Cauldron"}, Off: []string{"Snow"}}, got)
}

func TestOverridesHandler_EmptyListsNotNull(t *testing.T) {
	rec := serve(t, GetOverridesHandler(memory.NewStore(func(*memory.Backend) {})), http.MethodGet, "/api/testcube/package-overrides", "")
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"on":[],"off":[]}`, rec.Body.String())
}

func TestOverridesHandler_ReadOnlyCube(t *testing.T) {
	store := memory.NewStore(func(b *memory.Backend) { b.SetReadOnly("testcube") })
	rec := serve(t, SaveOverridesHandler(store), http.MethodPost, "/api/testcube/package-overrides", `{"on":["Cauldron"]}`)
	assert.Equal(t, http.StatusForbidden, rec.Code, "a cube that can't be written, such as a cc: cube, can't force packages")

	rec = serve(t, GetOverridesHandler(store), http.MethodGet, "/api/testcube/package-overrides", "")
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"on":[],"off":[]}`, rec.Body.String())
}

func TestOverridesHandler_BadBody(t *testing.T) {
	rec := serve(t, SaveOverridesHandler(memory.NewStore(func(*memory.Backend) {})), http.MethodPost, "/api/testcube/package-overrides", `{"on":"Cauldron"}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
