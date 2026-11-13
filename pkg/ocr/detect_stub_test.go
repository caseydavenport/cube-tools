//go:build !ocr_cv

package ocr

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStubsReportMissingOpenCV(t *testing.T) {
	_, err := DetectAndMatch("photo.jpg", miniCube(), DetectOptions{})
	require.ErrorIs(t, err, errNoOpenCV)

	_, err = MatchRegion("photo.jpg", Bbox{Width: 10, Height: 10}, miniCube(), DetectOptions{})
	require.ErrorIs(t, err, errNoOpenCV)
}
