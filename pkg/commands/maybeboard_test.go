package commands

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

// useCubeCobra points CubeCobra fetches at srv and shortens the maybeboard
// timeout to timeout for the test.
func useCubeCobra(t *testing.T, srv *httptest.Server, timeout time.Duration) {
	t.Helper()
	oldURL, oldTimeout := ccBaseURL, maybeboardClient.Timeout
	ccBaseURL = srv.URL
	maybeboardClient.Timeout = timeout
	t.Cleanup(func() {
		ccBaseURL = oldURL
		maybeboardClient.Timeout = oldTimeout
	})
}

// stallingServer answers paths containing "stall" only once the test ends,
// and every other path with an empty maybeboard.
func stallingServer(t *testing.T) *httptest.Server {
	t.Helper()
	done := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "stall") {
			<-done
			return
		}
		_, err := w.Write([]byte(`{"cards": {"maybeboard": [{"details": {"name": "Counterspell"}}]}}`))
		assert.NoError(t, err)
	}))
	t.Cleanup(func() {
		close(done)
		srv.Close()
	})
	return srv
}

func TestMaybeboard_StalledFetchTimesOut(t *testing.T) {
	srv := stallingServer(t)
	useCubeCobra(t, srv, 100*time.Millisecond)

	start := time.Now()
	_, err := NewCubeProvider(&cubes.Registry{}).Maybeboard("cc:stall")

	assert.Error(t, err)
	assert.Less(t, time.Since(start), 2*time.Second)
}

func TestMaybeboard_StalledCubeDoesNotBlockOthers(t *testing.T) {
	srv := stallingServer(t)
	useCubeCobra(t, srv, 3*time.Second)
	p := NewCubeProvider(&cubes.Registry{})

	stalled := make(chan error, 1)
	go func() {
		_, err := p.Maybeboard("cc:stall")
		stalled <- err
	}()
	time.Sleep(50 * time.Millisecond)

	start := time.Now()
	names, err := p.Maybeboard("cc:other")
	require.NoError(t, err)
	assert.Equal(t, []string{"Counterspell"}, names)
	assert.Less(t, time.Since(start), time.Second)
}

func TestMaybeboard_FailureIsCached(t *testing.T) {
	var fetches atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetches.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	useCubeCobra(t, srv, time.Second)
	p := NewCubeProvider(&cubes.Registry{})

	_, err := p.Maybeboard("cc:down")
	assert.Error(t, err)
	_, err = p.Maybeboard("cc:down")
	assert.Error(t, err)

	assert.Equal(t, int32(1), fetches.Load())
}
