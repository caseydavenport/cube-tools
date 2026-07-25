package cubes

import "testing"

func TestCubeCobraHelpers(t *testing.T) {
	if !IsCubeCobra("cc:polyversal") {
		t.Fatal("cc:polyversal should be a CubeCobra id")
	}
	if IsCubeCobra("polyverse") {
		t.Fatal("polyverse is a registry id, not CubeCobra")
	}
	if got := CubeCobraID("cc:polyversal"); got != "polyversal" {
		t.Fatalf("CubeCobraID = %q, want polyversal", got)
	}
	for _, ok := range []string{"polyversal", "abc-123_XYZ", "5f8d0d55b54764421b7156c3"} {
		if !ValidCubeCobraID(ok) {
			t.Errorf("ValidCubeCobraID(%q) = false, want true", ok)
		}
	}
	for _, bad := range []string{"", "../x", "a/b", `a\b`, "a.b", "has space"} {
		if ValidCubeCobraID(bad) {
			t.Errorf("ValidCubeCobraID(%q) = true, want false", bad)
		}
	}
}
