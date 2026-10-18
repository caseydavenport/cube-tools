package commands

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestDiscardOnErrorRemovesNewDraft(t *testing.T) {
	cubeDir := t.TempDir()
	d, err := drafts.Create(cubeDir, types.DraftMetadata{Date: "2026-01-01"})
	require.NoError(t, err)

	failed := errors.New("deck save failed")
	assert.ErrorIs(t, discardOnError(d, true, failed), failed)
	_, err = drafts.Find(cubeDir, d.ID)
	assert.ErrorIs(t, err, drafts.ErrNotFound)
}

func TestDiscardOnErrorKeepsExistingDraft(t *testing.T) {
	cubeDir := t.TempDir()
	d, err := drafts.Create(cubeDir, types.DraftMetadata{Date: "2026-01-01"})
	require.NoError(t, err)
	deck := types.NewDeck()
	deck.ID = 1
	require.NoError(t, d.SaveDeck(deck))

	failed := errors.New("deck save failed")
	assert.ErrorIs(t, discardOnError(d, false, failed), failed)
	kept, err := drafts.Find(cubeDir, d.ID)
	require.NoError(t, err)
	_, err = kept.Deck(1)
	assert.NoError(t, err)
}

func TestDiscardOnErrorKeepsDraftOnSuccess(t *testing.T) {
	cubeDir := t.TempDir()
	d, err := drafts.Create(cubeDir, types.DraftMetadata{Date: "2026-01-01"})
	require.NoError(t, err)

	assert.NoError(t, discardOnError(d, true, nil))
	_, err = drafts.Find(cubeDir, d.ID)
	assert.NoError(t, err)
}
