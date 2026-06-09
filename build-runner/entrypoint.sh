#!/bin/sh

set -e

mkdir -p /tmp/build
cd /tmp/build

echo "Cloning repository..."
git clone --depth 1 "$REPO_URL" .

echo "Installing dependencies..."
npm install --production=false

echo "Running build command..."
BUILD_COMMAND=${BUILD_COMMAND:-"npm run build"}
eval "$BUILD_COMMAND"

OUTPUT_DIR=${OUTPUT_DIR:-"dist"}

if [ -d "$OUTPUT_DIR" ]; then
    echo "Copying build output to /workspace..."
    cp -r "$OUTPUT_DIR"/* /workspace/

    chown -R $(stat -c '%u:%g' /workspace) /workspace/*

else
    echo "Error: Build output directory '$OUTPUT_DIR' not found after build."
    exit 1
fi

echo "Build completed successfully."