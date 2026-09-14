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
echo "Root directory: $ROOT_DIR"
cd "$ROOT_DIR"

step_end

# --- Step 3: Install ---
step_start "Install"

echo "Installing dependencies..."
if [ -f "bun.lock" ] || [ -f "bun.lockb" ]; then
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
  echo "No lockfile detected. Falling back to 'npm install'..."
  npm install --production=false
fi

step_end

# --- Step 4: Build ---
step_start "Build"

echo "Running build command..."
BUILD_COMMAND=${BUILD_COMMAND:-"npm run build"}
eval "$BUILD_COMMAND"

OUTPUT_DIR=${OUTPUT_DIR:-"dist"}

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Build output directory '$OUTPUT_DIR' not found after build."
    exit 1
fi

step_end

echo "Build completed successfully."