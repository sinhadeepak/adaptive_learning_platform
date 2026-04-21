# quiz

Quiz service (Go 1.22) — session lifecycle, question serving, answer submission, scoring (STU-REQ-09..19).

> **Sprint 0 scope**: HTTP `/health` + `/ready` only. Session, question, and scoring handlers land in Sprint 2.

## Run locally

```bash
go mod tidy
go run ./cmd/quiz
curl http://localhost:8000/health
```

## Test

```bash
go test ./...
```

## Lint

```bash
go vet ./...
gofmt -l -s .
```
