# Contributing

Thanks for your interest in contributing! We welcome bug reports, feature
requests, and pull requests.

## Code of Conduct

This project adheres to the Adobe [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold this code. Please report unacceptable
behavior to [Grp-opensourceoffice@adobe.com](mailto:Grp-opensourceoffice@adobe.com).

## Contributor License Agreement

All third-party contributions to this project must be accompanied by a signed
Contributor License Agreement. This gives Adobe permission to redistribute your
contributions as part of the project. [Sign our CLA](https://opensource.adobe.com/cla.html).
You only need to submit an Adobe CLA one time, so if you have submitted one
previously for another Adobe open source project, you do not need to do it again.

## Security Issues

Security issues shouldn't be reported on this issue tracker. Instead, please
follow the directions in [our security policy](SECURITY.md) to report them to the
Adobe Product Security Incident Response Team (PSIRT).

## Reporting Issues

Before opening a new issue, please search the [existing issues](../../issues) to
avoid duplicates. When filing a bug, include:

- What you ran and what you expected versus what happened
- The `workload-analyzer` version or commit, OS, and architecture
- A minimal reproduction — ideally the shape of the workload export or the SQL
  input that triggers it (never attach exports containing production data)

## Development

`workload-analyzer` is a Vite + React + TypeScript frontend (`web/`) embedded via
`go:embed` into a CGO/DuckDB Go backend. See the
[README](README.md#building) for the full build facts.

Prerequisites: Go (see `go.mod` for the pinned toolchain), a C compiler (CGO is
required for the DuckDB driver), and Node 22.

```bash
make build   # builds the web frontend first, then the Go binary
make test    # go test ./... + web vitest
```

The Go build embeds `web/dist`, so the frontend must be built first — `make build`
handles the ordering.

### Test-first workflow

This project is developed test-first. Every new feature or bug fix starts with a
failing test:

1. **Red** — write a test that captures the desired behavior, or for a bug
   reproduces it, and confirm it fails for the right reason.
2. **Green** — write the minimum code to make it pass.
3. **Refactor** — clean up with the test as a safety net.

For a bug, the reproduction test is the regression guard: it must fail on the
current code and pass after the fix. Don't delete or weaken a test to make a
change pass.

New or changed catalog queries have extra requirements: they must be exercised by
the fixture in `internal/catalog/queries_duckdb_test.go`, wired into `catalog.All()`
so the UI surfaces them, documented in the README's "Preloaded queries" table, and
have their counts updated in the query-count tests.

## Pull Requests

- Keep changes focused; open separate PRs for unrelated work.
- Make sure `make test` passes and the code is formatted (`gofmt` for Go, the
  project's ESLint/Prettier config for the frontend).
- Reference any related issue in the PR description.

## Licensing

Contributions are licensed under the Apache License, Version 2.0. See
[LICENSE](LICENSE). New source files should carry the project's standard Apache
license header (see any existing file for the exact text).
