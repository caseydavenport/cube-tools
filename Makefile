GIT_VERSION=$(shell git describe --tags --dirty --long --always --abbrev=12)
GO_FILES=$(shell find ./pkg -type f) $(shell find ./cmd -type f)
ORACLE_URL=https://data.scryfall.io/oracle-cards/oracle-cards-20250817210721.json

all: data/oracle-cards.json bin/parser
build: bin/server bin/parser

index: data/oracle-cards.json
	go run ./main.go index

clean:
	rm -f data/oracle-cards.json bin/parser

reparse:
	go run ./main.go reparse

data/oracle-cards.json:
	wget $(ORACLE_URL) -O $@

run:
	$(MAKE) run-server
	cd ui && npm start

###################
# Server build
###################
bin/server: $(GO_FILES)
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/server ./cmd/server/server.go

server: .server.created
.server.created: $(shell find pkg -name "*.go") bin/server Dockerfile.server
	docker build -t caseydavenport/cube-tools-server -f Dockerfile.server .
	touch $@

run-server: .server.created
	-docker rm -f cube-tools-server
	docker run --rm --name=cube-tools-server --detach -p 8888:8888 \
		-v $(PWD):/code \
		caseydavenport/cube-tools-server

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


