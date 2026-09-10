.PHONY: build build-web build-go test test-go test-web clean

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

build: build-web build-go

build-web:
	cd web && npm install && npm run build

build-go:
	CGO_ENABLED=1 go build -ldflags "-X main.version=$(VERSION)" -o workload-analyzer .

test: test-go test-web

test-go:
	CGO_ENABLED=1 go test ./...

test-web:
	cd web && npm test -- --run

clean:
	rm -f workload-analyzer
	rm -rf web/dist
