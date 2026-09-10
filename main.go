// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/api"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

// version is set at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	port := flag.Int("port", 8080, "port to serve on")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("workload-analyzer", version)
		return
	}

	args := flag.Args()
	if len(args) != 1 {
		fmt.Fprintf(os.Stderr, "Usage: workload-analyzer [--port PORT] <workload-export.zip>\n")
		os.Exit(1)
	}
	zipPath := args[0]

	if _, err := os.Stat(zipPath); err != nil {
		log.Fatalf("zip not found: %v", err)
	}

	dest, err := os.MkdirTemp("", "workload-analyzer-*")
	if err != nil {
		log.Fatalf("creating temp dir: %v", err)
	}
	defer os.RemoveAll(dest)

	log.Printf("extracting %s...", zipPath)
	files, err := loader.ExtractZip(zipPath, dest)
	if err != nil {
		log.Fatalf("extracting zip: %v", err)
	}

	db, err := loader.OpenDuckDB()
	if err != nil {
		log.Fatalf("opening duckdb: %v", err)
	}
	defer db.Close()

	meta, err := loader.ParseMeta(files)
	if err != nil {
		log.Printf("warning: could not parse metadata: %v", err)
		meta = &loader.Meta{}
	}

	schemas, err := loader.ParseSchemas(files)
	if err != nil {
		log.Printf("warning: could not parse schemas: %v", err)
		schemas = loader.Schemas{}
	}

	status := loader.NewLoadStatus()

	go func() {
		log.Println("loading tables into DuckDB...")
		loader.LoadCSVs(db, files, status)
		// Lock down file/network access now that the export is loaded, so the
		// SQL editor can't read arbitrary local files via read_csv/COPY.
		if err := loader.HardenDuckDB(db); err != nil {
			log.Printf("warning: could not harden DuckDB: %v", err)
		}
		log.Println("all tables loaded — ready")
	}()

	h := api.New(db, status, catalog.All(), meta, schemas)
	mux := http.NewServeMux()
	h.Register(mux)
	mux.Handle("/", spaFS())

	ln, err := listenWithFallback(*port)
	if err != nil {
		log.Fatalf("binding port: %v", err)
	}

	url := fmt.Sprintf("http://localhost:%d", ln.Addr().(*net.TCPAddr).Port)
	log.Printf("serving at %s", url)
	openBrowser(url)

	srv := &http.Server{Handler: mux}
	go srv.Serve(ln)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down")
	srv.Shutdown(context.Background())
}

// listenWithFallback binds to loopback only. /api/run executes arbitrary
// DuckDB SQL, so the server must not be reachable from the local network.
func listenWithFallback(port int) (net.Listener, error) {
	for i := 0; i < 3; i++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port+i))
		if err == nil {
			return ln, nil
		}
	}
	return net.Listen("tcp", "127.0.0.1:0")
}

func openBrowser(url string) {
	var cmd string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
	case "linux":
		cmd = "xdg-open"
	default:
		return
	}
	exec.Command(cmd, url).Start()
}
