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

# Full local dev stack: OCR-enabled backend on :8888 and the UI dev server on
# :6060 (proxies /api to :8888). Ctrl-C stops both. Needs OpenCV + tesseract
# installed locally; without tesseract the UI runs but scan/detect won't.
run: data/oracle-cards.json bin/server-ocr
	@command -v tesseract >/dev/null || echo "warning: tesseract not on PATH - OCR scan/detect will fail"
	@cd ui && [ -d node_modules ] || npm install
	./bin/server-ocr & \
	server_pid=$$!; \
	trap 'kill $$server_pid 2>/dev/null' EXIT INT TERM; \
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
