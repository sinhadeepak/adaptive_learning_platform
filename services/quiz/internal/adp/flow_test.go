package adp

import "testing"

func TestFlowNormalWhenMixed(t *testing.T) {
	recent := []AnswerSignal{
		{Correct: true, TimeMs: 5000},
		{Correct: false, TimeMs: 7000},
		{Correct: true, TimeMs: 6000},
	}
	d := Detect(recent, 6000)
	if d.State != FlowNormal {
		t.Errorf("want normal, got %s", d.State)
	}
}

func TestFlowFrustrationOnThreeWrong(t *testing.T) {
	recent := []AnswerSignal{
		{Correct: true, TimeMs: 5000},
		{Correct: false, TimeMs: 8000},
		{Correct: false, TimeMs: 9000},
		{Correct: false, TimeMs: 10000},
	}
	d := Detect(recent, 6000)
	if d.State != FlowFrustration {
		t.Errorf("want frustration, got %s", d.State)
	}
	if d.BAdjustment >= 0 {
		t.Errorf("frustration should drop b, got %.2f", d.BAdjustment)
	}
}

func TestFlowFrustrationOnSlowSolves(t *testing.T) {
	// Five answers, half correct, all slow (avg 15s > 2× median 6s).
	recent := []AnswerSignal{
		{Correct: true, TimeMs: 15000},
		{Correct: false, TimeMs: 16000},
		{Correct: true, TimeMs: 14000},
		{Correct: false, TimeMs: 15000},
		{Correct: true, TimeMs: 15000},
	}
	d := Detect(recent, 6000)
	if d.State != FlowFrustration {
		t.Errorf("want frustration (slow solves), got %s", d.State)
	}
}

func TestFlowBoredomOnFiveCorrectQuick(t *testing.T) {
	// Five correct, all under 0.5× median.
	recent := []AnswerSignal{
		{Correct: true, TimeMs: 2000},
		{Correct: true, TimeMs: 1500},
		{Correct: true, TimeMs: 1800},
		{Correct: true, TimeMs: 2000},
		{Correct: true, TimeMs: 1900},
	}
	d := Detect(recent, 6000)
	if d.State != FlowBoredom {
		t.Errorf("want boredom, got %s", d.State)
	}
	if d.BAdjustment <= 0 {
		t.Errorf("boredom should raise b, got %.2f", d.BAdjustment)
	}
}

func TestFlowNoMedianFallsBackToCorrectnessOnly(t *testing.T) {
	// 5 correct, conceptMedian=0 → timing check disabled.
	recent := []AnswerSignal{
		{Correct: true, TimeMs: 5000},
		{Correct: true, TimeMs: 5000},
		{Correct: true, TimeMs: 5000},
		{Correct: true, TimeMs: 5000},
		{Correct: true, TimeMs: 5000},
	}
	d := Detect(recent, 0)
	if d.State != FlowBoredom {
		t.Errorf("want boredom on 5-correct without median, got %s", d.State)
	}
}

func TestFlowEmptyInput(t *testing.T) {
	d := Detect(nil, 6000)
	if d.State != FlowNormal {
		t.Errorf("empty input should be normal, got %s", d.State)
	}
}
