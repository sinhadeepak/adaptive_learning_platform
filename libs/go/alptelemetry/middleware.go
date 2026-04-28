package alptelemetry

import "net/http"

// Middleware reads the inbound `traceparent` header (or generates a fresh
// trace-id), binds it to the request context, and echoes it back in the
// response so the next hop / client can stitch logs together.
//
// Designed to wrap any http.Handler chain — typically the outermost mux:
//
//	mux := http.NewServeMux()
//	... routes ...
//	httpHandler := alptelemetry.Middleware(mux)
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tid := ParseTraceparent(r.Header.Get(TraceparentHeader))
		if tid == "" {
			tid = GenerateTraceID()
		}
		ctx := WithTraceID(r.Context(), tid)
		w.Header().Set(TraceparentHeader, FormatTraceparent(tid))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
