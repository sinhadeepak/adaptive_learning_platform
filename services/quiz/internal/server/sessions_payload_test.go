// Unit tests for studentPayload — the answer-key redaction applied to a
// question payload before it is served to the student client. Pure JSON
// transform; no Postgres needed.

package server

import (
	"encoding/json"
	"testing"
)

func TestStudentPayloadStripsAnswerKeys(t *testing.T) {
	in := json.RawMessage(`{
		"stem": "Pick the capital",
		"options": [{"id":"A","text":"Paris"},{"id":"B","text":"Lyon"}],
		"correct_id": "A",
		"explanation": "Paris is the capital."
	}`)

	out := studentPayload(in)

	var obj map[string]json.RawMessage
	if err := json.Unmarshal(out, &obj); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	if _, leaked := obj["correct_id"]; leaked {
		t.Error("correct_id was not stripped from served payload")
	}
	if _, leaked := obj["explanation"]; leaked {
		t.Error("explanation was not stripped from served payload")
	}
	if _, ok := obj["options"]; !ok {
		t.Error("options must be preserved for rendering")
	}
	if _, ok := obj["stem"]; !ok {
		t.Error("stem must be preserved for rendering")
	}
}

func TestStudentPayloadStripsTypedAnswerKeys(t *testing.T) {
	in := json.RawMessage(`{
		"list_a":[{"id":"1","text":"H2O"}],
		"list_b":[{"id":"a","text":"Water"}],
		"correct_pairs":[{"left_id":"1","right_id":"a"}],
		"correct_order":["1","2"],
		"correct":42,
		"model_answer":"a long essay",
		"is_correct":true,
		"correct_markers":[{"x":1}]
	}`)

	out := studentPayload(in)
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(out, &obj); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	for _, k := range []string{"correct_pairs", "correct_order", "correct", "model_answer", "is_correct", "correct_markers"} {
		if _, leaked := obj[k]; leaked {
			t.Errorf("%s was not stripped", k)
		}
	}
	for _, k := range []string{"list_a", "list_b"} {
		if _, ok := obj[k]; !ok {
			t.Errorf("%s must be preserved for rendering", k)
		}
	}
}

func TestStudentPayloadPreservesRenderStructuralFields(t *testing.T) {
	// rubric, key_concepts and word_bank are shown to the student by design —
	// they must survive redaction even though they are answer-adjacent.
	in := json.RawMessage(`{
		"stem":"The capital is ___",
		"rubric":[{"criterion":"clarity","weight":1}],
		"key_concepts":["entropy"],
		"word_bank":["Paris","Lyon"]
	}`)

	out := studentPayload(in)
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(out, &obj); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	for _, k := range []string{"rubric", "key_concepts", "word_bank", "stem"} {
		if _, ok := obj[k]; !ok {
			t.Errorf("%s must be preserved (renderer depends on it)", k)
		}
	}
}

func TestStudentPayloadStripsFillAndMapAnswers(t *testing.T) {
	// FILL_BLANK_SINGLE accepted, MAP_LOCATION target coords, and nested
	// FILL_BLANK_MULTI blanks[].accepted are all the answer — strip them.
	in := json.RawMessage(`{
		"stem":"a {{1}} b {{2}}",
		"accepted":["Paris"],
		"target_lat":23.02,"target_lng":72.57,"tolerance_deg":0.5,"label":"Ahmedabad",
		"blanks":[{"id":"1","accepted":["x"],"match_mode":"exact"},{"id":"2","accepted":["y"]}]
	}`)

	out := studentPayload(in)
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(out, &obj); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}
	for _, k := range []string{"accepted", "target_lat", "target_lng", "tolerance_deg"} {
		if _, leaked := obj[k]; leaked {
			t.Errorf("%s was not stripped", k)
		}
	}
	if _, ok := obj["label"]; !ok {
		t.Error("map label should be preserved (already in the stem)")
	}
	var blanks []map[string]json.RawMessage
	if err := json.Unmarshal(obj["blanks"], &blanks); err != nil {
		t.Fatalf("blanks not valid: %v", err)
	}
	for _, b := range blanks {
		if _, leaked := b["accepted"]; leaked {
			t.Error("blanks[].accepted was not stripped")
		}
		if _, ok := b["id"]; !ok {
			t.Error("blanks[].id must be preserved")
		}
	}
}

func TestStudentPayloadStripsRangeFormulaStatementAnswers(t *testing.T) {
	in := json.RawMessage(`{
		"stem":"q","unit":"°C","low":-273,"high":0,
		"target_expression":"x^2+1","free_symbols":["x"],
		"statements":[{"id":"1"}],"options":[{"id":"A"}],"correct_statement_ids":[1,3]
	}`)
	out := studentPayload(in)
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(out, &obj); err != nil {
		t.Fatalf("output not valid JSON: %v", err)
	}
	for _, k := range []string{"low", "high", "target_expression", "correct_statement_ids"} {
		if _, leaked := obj[k]; leaked {
			t.Errorf("%s was not stripped", k)
		}
	}
	for _, k := range []string{"stem", "unit", "free_symbols", "statements", "options"} {
		if _, ok := obj[k]; !ok {
			t.Errorf("%s must be preserved for rendering", k)
		}
	}
}

func TestStudentPayloadPassThrough(t *testing.T) {
	// Empty payload and non-object JSON are returned unchanged.
	if got := studentPayload(nil); got != nil {
		t.Errorf("nil payload should pass through, got %q", got)
	}
	if got := studentPayload(json.RawMessage("")); len(got) != 0 {
		t.Errorf("empty payload should pass through, got %q", got)
	}
	arr := json.RawMessage(`["not","an","object"]`)
	if got := studentPayload(arr); string(got) != string(arr) {
		t.Errorf("non-object JSON should pass through unchanged, got %q", got)
	}
	// An object with no answer keys is returned untouched.
	clean := json.RawMessage(`{"stem":"hi","options":[]}`)
	if got := studentPayload(clean); string(got) != string(clean) {
		t.Errorf("payload without answer keys should be unchanged, got %q", got)
	}
}
