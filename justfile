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
    gh workflow run pages.yml --ref main
    sleep 3
    gh run watch --exit-status "$(gh run list --workflow pages.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"

# Redo the README screenshots and demo video in docs/ (needs google-chrome and ffmpeg)
media:
    tools/media/media.sh

# Check Code from layout against Mermaid itself, with dagre and ELK (needs google-chrome)
mermaid-check:
    tools/mermaid-check/check.sh

# Remove build output
clean:
    rm -rf dist
