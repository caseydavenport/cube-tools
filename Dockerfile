# Hosted image: the API server plus the built UI. On Cloud Run, all of data/,
# oracle files included, comes from a bucket mounted at /code/data.

FROM node:22 AS ui
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npx webpack --mode production && rm -f public/data

FROM golang:1.26 AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY pkg pkg
RUN CGO_ENABLED=0 go build -o /server ./cmd/server/server.go

# distroless/static carries the CA certificates the CubeCobra fetches need.
FROM gcr.io/distroless/static-debian12
WORKDIR /code
COPY --from=server /server /server
COPY --from=ui /ui/public /ui
EXPOSE 8888
ENTRYPOINT ["/server", "-ui-dir", "/ui"]
