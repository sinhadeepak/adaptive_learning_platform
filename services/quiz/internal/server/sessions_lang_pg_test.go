package server

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
)

func TestPG_SessionStoresContentLanguage(t *testing.T) {
	f := newPGFixture(t, stubFlags{irtEnabled: false})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q,"mode":"PRACTICE","language":"hi"}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	sid := uuid.MustParse(started.SessionID)
	sess, err := f.st.GetSession(t.Context(), sid)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if sess.ContentLanguage != "hi" {
		t.Fatalf("want content_language=hi, got %q", sess.ContentLanguage)
	}
}

func TestPG_SessionCoercesUnknownLanguageToEn(t *testing.T) {
	f := newPGFixture(t, stubFlags{irtEnabled: false})
	if f == nil {
		return
	}
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q,"mode":"PRACTICE","language":"hinglish"}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })
	sess, _ := f.st.GetSession(t.Context(), uuid.MustParse(started.SessionID))
	if sess.ContentLanguage != "en" {
		t.Fatalf("want coerced en, got %q", sess.ContentLanguage)
	}
}
