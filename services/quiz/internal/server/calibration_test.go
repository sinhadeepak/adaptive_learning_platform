package server

import "testing"

// P6-S54 — pure-function tests for the calibration + intent helpers.
// The PATCH endpoint itself is covered by the existing pg integration
// suite (sessions_pg_test.go) when run with the `pg` build tag.

func TestNormalizeIntentAnchor(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"match", "match"},
		{"push", "push"},
		{"build_confidence", "build_confidence"},
		{"PUSH", "push"},
		{"  Build_Confidence  ", "build_confidence"},
		{"", "match"},
		{"garbage", "match"},
	}
	for _, c := range cases {
		if got := normalizeIntentAnchor(c.in); got != c.want {
			t.Errorf("normalizeIntentAnchor(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestIntentAnchorThetaOffset(t *testing.T) {
	cases := []struct {
		in   string
		want float32
	}{
		{"match", 0},
		{"push", 0.4},
		{"build_confidence", -0.4},
		{"unknown", 0},
	}
	for _, c := range cases {
		if got := intentAnchorThetaOffset(c.in); got != c.want {
			t.Errorf("intentAnchorThetaOffset(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestNormalizeCalibrationFeedback(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantOk  bool
	}{
		{"too_easy", "too_easy", true},
		{"right", "right", true},
		{"too_hard", "too_hard", true},
		{"TOO_HARD", "too_hard", true},
		{"  right  ", "right", true},
		{"", "", false},
		{"garbage", "", false},
	}
	for _, c := range cases {
		got, ok := normalizeCalibrationFeedback(c.in)
		if got != c.want || ok != c.wantOk {
			t.Errorf("normalizeCalibrationFeedback(%q) = %q/%v, want %q/%v",
				c.in, got, ok, c.want, c.wantOk)
		}
	}
}
