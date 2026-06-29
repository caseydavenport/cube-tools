GIT_VERSION=$(shell git describe --tags --dirty --long --always --abbrev=12)
GO_FILES=$(shell find ./pkg -type f) $(shell find ./cmd -type f)

all: data/oracle-cards.json bin/parser
build: bin/server bin/parser

test: ut

ut:
	go test ./...

index: data/oracle-cards.json
	go run ./main.go index

clean:
	rm -f data/oracle-cards.json bin/parser

reparse:
	go run ./main.go reparse

data/oracle-cards.json:
	./scripts/download-oracle-data $@

# Full local dev stack: the OCR backend on :8888 and the UI dev server on :6060
# (proxies /api to :8888). Ctrl-C stops both. Runs the backend from the OCR
# Docker image so OpenCV + tesseract come from the container, not the host - no
# local install needed. The repo is mounted at /code so the container sees ./data.
run: data/oracle-cards.json .server-ocr.created
	@[ -d ui/node_modules ] || ( cd ui && npm install )
	-docker rm -f cube-tools-server-ocr 2>/dev/null
	docker run --rm --name=cube-tools-server-ocr --detach -p 8888:8888 \
		-v $(PWD):/code \
		caseydavenport/cube-tools-server-ocr
	trap 'docker rm -f cube-tools-server-ocr 2>/dev/null' EXIT INT TERM; \
	cd ui && npm start

# Hot-reloading dev loop: the OCR server under `air` (rebuilds + restarts on
# every .go save) plus the UI dev server, the same auto-update you get for the
# UI. air runs inside a container carrying the Go toolchain + OpenCV headers +
# tesseract, so rebuilds happen in-container and need nothing on the host. The
# repo is bind-mounted at /code, so host edits trigger rebuilds; the named
# gocache volume keeps the Go build cache warm across runs so rebuilds stay fast.
# Ctrl-C stops both.
dev: data/oracle-cards.json .server-ocr-dev.created
	@[ -d ui/node_modules ] || ( cd ui && npm install )
	-docker rm -f cube-tools-server-dev 2>/dev/null
	docker run --rm --name=cube-tools-server-dev --detach -p 8888:8888 \
		-v $(PWD):/code \
		-v cube-tools-gocache:/root/.cache/go-build \
		caseydavenport/cube-tools-server-dev
	@echo "server running under air in container - edit a .go file to rebuild; tail with: docker logs -f cube-tools-server-dev"
	trap 'docker rm -f cube-tools-server-dev 2>/dev/null' EXIT INT TERM; \
	cd ui && npm start

###################
# Server build
###################
bin/server: $(GO_FILES)
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/server ./cmd/server/server.go

# Native server with OCR support (requires OpenCV + tesseract installed locally).
bin/server-ocr: $(GO_FILES)
	mkdir -p bin
	CGO_ENABLED=1 go build -tags ocr_cv -o bin/server-ocr ./cmd/server/server.go

run-server-native: bin/server-ocr
	./bin/server-ocr

server: .server.created
.server.created: $(shell find pkg -name "*.go") bin/server Dockerfile.server
	docker build -t caseydavenport/cube-tools-server -f Dockerfile.server .
	touch $@

run-server: .server.created
	-docker rm -f cube-tools-server
	docker run --rm --name=cube-tools-server --detach -p 8888:8888 \
		-v $(PWD):/code \
		caseydavenport/cube-tools-server

# OCR server image. The Dockerfile builds the -tags ocr_cv binary itself (it
# bundles OpenCV + tesseract), so this depends on the sources, not bin/server-ocr.
server-ocr: .server-ocr.created
.server-ocr.created: $(GO_FILES) Dockerfile.server-ocr
	docker build -t caseydavenport/cube-tools-server-ocr -f Dockerfile.server-ocr .
	touch $@

run-server-ocr: .server-ocr.created
	-docker rm -f cube-tools-server-ocr
	docker run --rm --name=cube-tools-server-ocr --detach -p 8888:8888 \
		-v $(PWD):/code \
		caseydavenport/cube-tools-server-ocr

# Dev image for `make dev`: build toolchain + OpenCV + tesseract + air. Depends
# only on the Dockerfile (source is bind-mounted at run time, not copied in), so
# it rebuilds when the dev image definition changes, not on every code edit.
.server-ocr-dev.created: Dockerfile.server-ocr-dev go.mod go.sum
	docker build -t caseydavenport/cube-tools-server-dev -f Dockerfile.server-ocr-dev .
	touch $@

###################
# Parse CLI build
###################
bin/parser: $(GO_FILES)
	mkdir -p bin
	go build -o bin/parser ./main.go

image:
	docker build -t caseydavenport/cube-tools .
	docker tag caseydavenport/cube-tools caseydavenport/cube-tools:$(GIT_VERSION)

push:
	docker push caseydavenport/cube-tools:$(GIT_VERSION)
	docker push caseydavenport/cube-tools:latest
