#!/bin/sh

set -e

export GIT_TERMINAL_PROMPT=0

STEP_NAME=""
STEP_START=0

step_start() {
  STEP_NAME="$1"
  STEP_START=$(date +%s)
  echo "[x44:step:start] $STEP_NAME"
}

step_end() {
  local now=$(date +%s)
  local duration=$((now - STEP_START))
  echo "[x44:step:end] $STEP_NAME (${duration}s)"
}

# --- Step 1: Repository ---
step_start "Repository"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable is not set."
  exit 1
fi

echo "Cloning repository ($BRANCH)..."
BASIC_AUTH=$(printf "x-access-token:%s" "$GITHUB_TOKEN" | base64 | tr -d '\r\n')

git init -b main
git remote add origin "$REPO_URL"

git -c http.extraheader="Authorization: Basic $BASIC_AUTH" \
    fetch --depth 1 origin "$BRANCH"
git checkout --detach FETCH_HEAD

unset GITHUB_TOKEN
unset BASIC_AUTH

step_end

# --- Step 2: Environment ---
step_start "Environment"

echo "Checking execution environment..."
echo "Node: $(node -v 2>/dev/null || echo 'not installed')"
echo "Bun:  $(bun -v 2>/dev/null || echo 'not installed')"
echo "NPM:  $(npm -v 2>/dev/null || echo 'not installed')"
echo "Root directory: ${ROOT_DIR:-.}"
cd "${ROOT_DIR:-.}"

step_end

# --- Step 3: Install ---
step_start "Install"

if [ ! -f "package.json" ]; then
  echo "No package.json found. Skipping dependency installation."
elif [ -f "bun.lock" ] || [ -f "bun.lockb" ]; then
  echo "Detected Bun lockfile. Running 'bun install --frozen-lockfile'..."
  bun install --frozen-lockfile
elif [ -f "package-lock.json" ]; then
  echo "Detected package-lock.json. Running 'npm ci'..."
  npm ci
elif [ -f "pnpm-lock.yaml" ]; then
  echo "Detected pnpm-lock.yaml. Running 'pnpm install --frozen-lockfile'..."
  pnpm install --frozen-lockfile
elif [ -f "yarn.lock" ]; then
  echo "Detected yarn.lock. Running 'yarn install --frozen-lockfile'..."
  yarn install --frozen-lockfile
else
  echo "No lockfile detected. Running 'npm install'..."
  npm install --production=false
fi

step_end

# --- Step 4: Build ---
step_start "Build"

# Skip build if there is no package.json and BUILD_COMMAND was left as default "npm run build"
if [ ! -f "package.json" ] && [ "$BUILD_COMMAND" = "npm run build" ]; then
  echo "Static site detected without package.json. Skipping build command."
elif [ -n "$BUILD_COMMAND" ] && [ "$BUILD_COMMAND" != "none" ] && [ "$BUILD_COMMAND" != "null" ]; then
  echo "Executing: $BUILD_COMMAND"
  eval "$BUILD_COMMAND"
else
  echo "No build command specified. Skipping build step."
fi

# Fallback: if output_dir is "dist" but doesn't exist, and index.html is in root, use root
OUTPUT_DIR=${OUTPUT_DIR:-"."}
if [ "$OUTPUT_DIR" != "." ] && [ ! -d "$OUTPUT_DIR" ] && [ -f "index.html" ]; then
  echo "Notice: Output directory '$OUTPUT_DIR' not found, but 'index.html' exists in root. Using root directory."
  OUTPUT_DIR="."
fi

mkdir -p /output

if [ "$OUTPUT_DIR" = "." ] || [ "$OUTPUT_DIR" = "./" ] || [ -z "$OUTPUT_DIR" ]; then
  echo "Copying root files to output..."
  cp -r . /output/
  rm -rf /output/.git /output/node_modules
else
  if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Build output directory '$OUTPUT_DIR' not found after build."
    exit 1
  fi
  echo "Copying '$OUTPUT_DIR' to output..."
  cp -r "$OUTPUT_DIR"/. /output/
fi

step_end

echo "Build completed successfully."