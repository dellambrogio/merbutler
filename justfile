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

# Remove build output
clean:
    rm -rf dist
