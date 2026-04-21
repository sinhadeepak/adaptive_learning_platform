# syntax=docker/dockerfile:1.7
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/quiz ./cmd/quiz

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/quiz /quiz
EXPOSE 8000
USER nonroot:nonroot
ENTRYPOINT ["/quiz"]
