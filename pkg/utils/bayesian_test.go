package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBayesianAverage_PriorStrengthControlsShrinkage(t *testing.T) {
	// 9-1 with a 10-game prior: (9 + 5) / (10 + 10) = 70%.
	assert.Equal(t, 70.0, BayesianAverage(9, 1, 0, 10))

	// The same record with a 90-game prior: (9 + 45) / (10 + 90) = 54%.
	assert.Equal(t, 54.0, BayesianAverage(9, 1, 0, 90))
}

func TestBayesianAverage_DrawsCountAsHalfWin(t *testing.T) {
	// 0-0-10 with a 10-game prior: (5 + 5) / (10 + 10) = 50%.
	assert.Equal(t, 50.0, BayesianAverage(0, 0, 10, 10))
}

func TestBayesianAverage_NoGames(t *testing.T) {
	assert.Equal(t, 0.0, BayesianAverage(0, 0, 0, 30))
}
