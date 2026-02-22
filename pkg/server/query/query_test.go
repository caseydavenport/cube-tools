package query

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func makeRequest(query string) *http.Request {
	return httptest.NewRequest(http.MethodGet, "/test?"+query, nil)
}

// --- GetInt ---

func TestGetInt(t *testing.T) {
	assert.Equal(t, 42, GetInt(makeRequest("val=42"), "val"))
}

func TestGetInt_Missing(t *testing.T) {
	assert.Equal(t, 0, GetInt(makeRequest(""), "val"))
}

func TestGetInt_Invalid(t *testing.T) {
	assert.Equal(t, 0, GetInt(makeRequest("val=abc"), "val"))
}

func TestGetInt_Negative(t *testing.T) {
	assert.Equal(t, -5, GetInt(makeRequest("val=-5"), "val"))
}

// --- GetString ---

func TestGetString(t *testing.T) {
	assert.Equal(t, "hello", GetString(makeRequest("val=hello"), "val"))
}

func TestGetString_Missing(t *testing.T) {
	assert.Equal(t, "", GetString(makeRequest(""), "val"))
}

func TestGetString_Null(t *testing.T) {
	assert.Equal(t, "", GetString(makeRequest("val=null"), "val"))
}

func TestGetString_Empty(t *testing.T) {
	assert.Equal(t, "", GetString(makeRequest("val="), "val"))
}

// --- GetBool ---

func TestGetBool(t *testing.T) {
	assert.True(t, GetBool(makeRequest("val=true"), "val"))
	assert.False(t, GetBool(makeRequest("val=false"), "val"))
}

func TestGetBool_Missing(t *testing.T) {
	assert.False(t, GetBool(makeRequest(""), "val"))
}

func TestGetBool_Invalid(t *testing.T) {
	assert.False(t, GetBool(makeRequest("val=maybe"), "val"))
}

func TestGetBool_Numeric(t *testing.T) {
	assert.True(t, GetBool(makeRequest("val=1"), "val"))
	assert.False(t, GetBool(makeRequest("val=0"), "val"))
}
