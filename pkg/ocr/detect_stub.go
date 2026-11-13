//go:build !ocr_cv

package ocr

import (
	"errors"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

var errNoOpenCV = errors.New("cube-tools was built without OpenCV support; rebuild with `-tags ocr_cv` (requires libopencv-dev or `brew install opencv`)")

// DetectAndMatch always fails in a build without the `ocr_cv` tag, because the
// real implementation needs OpenCV.
func DetectAndMatch(imagePath string, cube *types.Cube, opts DetectOptions) ([]MatchResult, error) {
	return nil, errNoOpenCV
}

// MatchRegion always fails in a build without the `ocr_cv` tag, because the
// real implementation needs OpenCV.
func MatchRegion(imagePath string, box Bbox, cube *types.Cube, opts DetectOptions) (MatchResult, error) {
	return MatchResult{}, errNoOpenCV
}
