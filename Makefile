GIT_VERSION=$(shell git describe --tags --dirty --long --always --abbrev=12)

all: data/oracle-cards.json bin/parser

run:
	go run ./cmd/server/server.go &
	cd ui && npm start

build bin/parser: $(shell find ./pkg -type f) $(shell find ./cmd -type f)
	mkdir -p bin
	go build -o bin/parser ./main.go

image:
	docker build -t caseydavenport/cube-tools .
	docker tag caseydavenport/cube-tools caseydavenport/cube-tools:$(GIT_VERSION)

push:
	docker push caseydavenport/cube-tools:$(GIT_VERSION)
	docker push caseydavenport/cube-tools:latest

ORACLE_URL=https://data.scryfall.io/oracle-cards/oracle-cards-20250405210637.json
data/oracle-cards.json:
	# TODO: Automatically fetch the latest, using the API.
	mkdir -p data
	wget $(ORACLE_URL) -O $@

index: data/oracle-cards.json
	go run ./main.go index

clean:
	rm -f data/oracle-cards.json bin/parser

reparse:
	go run ./main.go reparse

