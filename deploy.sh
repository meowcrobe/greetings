#!/bin/bash
set -e

# Change to the directory of the script
cd "$(dirname "$0")"

echo "Building greetings..."
npm run build

echo "Deploying to production..."
# Ensure trailing slash on source to copy contents, not directory itself
rsync -av --delete dist/ avonx@159.69.91.179:/home/avonx/gfx/greetings/

echo "Deployment complete!"
