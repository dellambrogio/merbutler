# List recipes
default:
    @just --list

# Install dependencies
install:
    npm install

# Start the dev server
dev:
    npm run dev

# Run the tests
test:
    npm test

# Run the tests in watch mode
watch:
    npx vitest

# Type-check without building
check:
    npx tsc --noEmit

# Type-check and build to dist/
build:
    npm run build

# Serve the production build
preview: build
    npx vite preview

# Type-check and test
ci: check test

# Deploy main to GitHub Pages (runs the Pages workflow) and follow the run
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    out="$(gh workflow run pages.yml --ref main 2>&1)"
    echo "$out"
    # gh prints the new run's URL, which ends in its id.
    id="$(grep -oE 'actions/runs/[0-9]+' <<<"$out" | grep -oE '[0-9]+$' || true)"
    # Older gh prints no URL: wait for a run started at or after the trigger.
    for _ in $(seq 30); do
        [ -n "$id" ] && break
        sleep 2
        id="$(gh run list --workflow pages.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt \
            --jq "[.[] | select(.createdAt >= \"$started\")] | last | .databaseId // empty")"
    done
    if [ -z "$id" ]; then echo "No new Pages run found" >&2; exit 1; fi
    echo "Watching run $id"
    gh run watch "$id" --exit-status

# Redo the README screenshots and demo video in docs/ (needs google-chrome and ffmpeg)
media:
    tools/media/media.sh

# Check Code from layout against Mermaid itself, with dagre and ELK (needs google-chrome)
mermaid-check:
    tools/mermaid-check/check.sh

# Remove build output
clean:
    rm -rf dist
