#!/bin/sh

set -e

export GIT_TERMINAL_PROMPT=0

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable is not set."
  exit 1
fi

echo "Cloning repository($BRANCH)..."

BASIC_AUTH=$(printf "x-access-token:%s" "$GITHUB_TOKEN" | base64 | tr -d '\r\n')

git init
git remote add origin "$REPO_URL"

git -c http.extraheader="Authorization: Basic $BASIC_AUTH" \
    fetch --depth 1 origin "$BRANCH"
git checkout --detach FETCH_HEAD

unset GITHUB_TOKEN
unset BASIC_AUTH

echo "Changing directory to $ROOT_DIR"
cd $ROOT_DIR

echo "Installing dependencies..."
npm install --production=false

echo "Running build command..."
BUILD_COMMAND=${BUILD_COMMAND:-"npm run build"}
eval "$BUILD_COMMAND"

OUTPUT_DIR=${OUTPUT_DIR:-"dist"}

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Build output directory '$OUTPUT_DIR' not found after build."
    exit 1
fi

echo "Build completed successfully."