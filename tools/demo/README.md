# Demo recording

Scripted screen recording of the UI, used as the marketing asset linked from
the top-level README. The rendered files live on the orphan `media` branch,
never on `main` and never in a release, so re-recording does not bloat the
repository history.

## Prerequisites

- Google Chrome installed (Playwright drives it via the `chrome` channel, no
  browser download needed)
- Node.js 24+, `ffmpeg` on `PATH`
- A built `workload-analyzer` binary and a demo export that is safe to show
  (the `movr` sample export; never a customer export)

## Record

```bash
# 1. Serve the sample export on the port the script expects.
#    The binary opens a browser tab on start; shadow `open` if you don't want that.
./workload-analyzer --port 8099 workload-export.zip &

# 2. Record and encode. Writes out/demo.webm, out/demo.mp4, out/demo.gif.
cd tools/demo
npm install
npx playwright install ffmpeg   # one-time: Playwright's own encoder for .webm
npm run demo
```

Set `URL` to record against a different port. The tour is defined in
`record.js`; keep the scenes in sync with the README feature list when the UI
changes.

## Publish

```bash
git checkout media          # orphan branch: git checkout --orphan media on first use
cp tools/demo/out/demo.mp4 tools/demo/out/demo.gif .
git add demo.mp4 demo.gif
git commit -m "media: re-record demo"
git push --force origin media
```

The README links to the raw files on that branch, so the URLs stay stable
across re-recordings.
