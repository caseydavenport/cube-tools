all: bin/parser

bin/parser: $(shell find pkg '*.go') $(shell find cmd '*.go')
	mkdir -p bin
	go build -o bin/parser ./cmd/parser/main.go
