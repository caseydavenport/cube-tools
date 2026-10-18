//go:build ocr_cv && (ocr_e2e || ocr_diag)

package ocr

import (
	"fmt"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// latestPolyverseCube loads polyverse's most recent cube snapshot under
// dataRoot, the list the photo tests match card names against.
func latestPolyverseCube(dataRoot string) (*types.Cube, error) {
	c, ok, err := drafts.LatestSnapshot(filepath.Join(dataRoot, "polyverse"))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("no polyverse snapshot under %s", dataRoot)
	}
	return c, nil
}
