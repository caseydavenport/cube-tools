package players

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddAssignsIncreasingIDs(t *testing.T) {
	root := t.TempDir()
	freddie, err := Add(root, "Freddie Mercury")
	require.NoError(t, err)
	ozzy, err := Add(root, "Ozzy Osbourne")
	require.NoError(t, err)
	assert.Equal(t, Player{ID: 1, Name: "Freddie Mercury"}, freddie)
	assert.Equal(t, Player{ID: 2, Name: "Ozzy Osbourne"}, ozzy)

	l, err := Load(root)
	require.NoError(t, err)
	assert.Equal(t, []Player{freddie, ozzy}, l.Players)
}

func TestAddRejectsDuplicateIgnoringCase(t *testing.T) {
	root := t.TempDir()
	_, err := Add(root, "Freddie Mercury")
	require.NoError(t, err)
	_, err = Add(root, "freddie mercury")
	assert.ErrorIs(t, err, ErrNameTaken)
}

func TestValidateName(t *testing.T) {
	got, err := validateName("  Joan Jett ")
	require.NoError(t, err)
	assert.Equal(t, "Joan Jett", got)

	for _, bad := range []string{"", "   ", "42", "p3", "P12"} {
		_, err := validateName(bad)
		assert.ErrorIs(t, err, ErrInvalidName, bad)
	}
	for _, ok := range []string{"p3x", "Prince"} {
		_, err := validateName(ok)
		assert.NoError(t, err, ok)
	}
}

func TestLookupByIDOrName(t *testing.T) {
	l := &List{Players: []Player{{ID: 1, Name: "Freddie Mercury"}, {ID: 2, Name: "Ozzy Osbourne"}}}

	p, err := l.Lookup("2")
	require.NoError(t, err)
	assert.Equal(t, "Ozzy Osbourne", p.Name)

	p, err = l.Lookup("OZZY osbourne")
	require.NoError(t, err)
	assert.Equal(t, 2, p.ID)

	_, err = l.Lookup("Stevie")
	assert.ErrorIs(t, err, ErrUnknownPlayer)
	_, err = l.Lookup("9")
	assert.ErrorIs(t, err, ErrUnknownPlayer)
}

func TestRenameKeepsID(t *testing.T) {
	root := t.TempDir()
	_, err := Add(root, "Freddie Mercury")
	require.NoError(t, err)
	_, err = Add(root, "Ozzy Osbourne")
	require.NoError(t, err)

	_, err = Rename(root, 1, "ozzy osbourne")
	assert.ErrorIs(t, err, ErrNameTaken)
	_, err = Rename(root, 7, "Stevie Nicks")
	assert.ErrorIs(t, err, ErrUnknownPlayer)

	p, err := Rename(root, 1, "FREDDIE MERCURY")
	require.NoError(t, err)
	assert.Equal(t, Player{ID: 1, Name: "FREDDIE MERCURY"}, p)

	l, err := Load(root)
	require.NoError(t, err)
	got, ok := l.ByID(1)
	require.True(t, ok)
	assert.Equal(t, "FREDDIE MERCURY", got.Name)
}

func TestConcurrentAddsGetDistinctIDs(t *testing.T) {
	root := t.TempDir()
	var wg sync.WaitGroup
	ids := make([]int, 20)
	for i := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p, err := Add(root, fmt.Sprintf("Roadie %d", i))
			assert.NoError(t, err)
			ids[i] = p.ID
		}()
	}
	wg.Wait()

	seen := map[int]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	assert.Len(t, seen, 20)
	l, err := Load(root)
	require.NoError(t, err)
	assert.Len(t, l.Players, 20)
}

func TestLoadMissingFileIsEmpty(t *testing.T) {
	l, err := Load(t.TempDir())
	require.NoError(t, err)
	assert.Empty(t, l.Players)
}
