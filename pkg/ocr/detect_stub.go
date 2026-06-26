//go:build !ocr_cv

package ocr

import (
	"errors"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// DetectAndMatch is the stub used when the binary is built without the
// `ocr_cv` build tag. The real implementation requires OpenCV.
func DetectAndMatch(imagePath string, cube *types.Cube, opts DetectOptions) ([]MatchResult, error) {
	return nil, errors.New("cube-tools was built without OpenCV support; rebuild with `-tags ocr_cv` (requires libopencv-dev or `brew install opencv`)")
}

// MatchRegion is the stub used when the binary is built without `ocr_cv`.
func MatchRegion(imagePath string, box Bbox, cube *types.Cube, opts DetectOptions) (MatchResult, error) {
	return MatchResult{}, errors.New("cube-tools was built without OpenCV support; rebuild with `-tags ocr_cv` (requires libopencv-dev or `brew install opencv`)")
}
