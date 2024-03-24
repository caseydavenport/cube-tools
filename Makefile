all: data/oracle-cards.json bin/parser

bin/parser: $(shell find ./pkg -type f) $(shell find ./cmd -type f)
	mkdir -p bin
	go build -o bin/parser ./cmd/parser/main.go

data/oracle-cards.json:
	# TODO: Automatically fetch the latest, using the API.
	mkdir -p data
	wget https://data.scryfall.io/oracle-cards/oracle-cards-20240323210217.json -O $@

index:
	go run ./cmd/parser/main.go -index

clean:
	rm -f data/oracle-cards.json

DRAFTS:=$(shell ls -d drafts/*/ | cut -f2 -d'/')
reparse:
	for dir in ${DRAFTS}; do \
		echo "Processing $${dir}"; \
		./bin/parser -deck-dir drafts/$${dir}  -date $${dir} -filetype ".txt"; \
		./bin/parser -deck-dir drafts/$${dir}  -date $${dir} -filetype ".csv"; \
	done
