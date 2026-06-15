#!/bin/bash
set -e

CONTAINER="alti-backend"
APP_ROOT="/app/alti-core-service"

echo "=== Extracting code on host ==="
rm -rf /tmp/app-staging
mkdir -p /tmp/app-staging
cd /tmp/app-staging
tar xzf /tmp/app-code.tar.gz

# Stop container
echo "=== Stopping container ==="
docker stop $CONTAINER 2>/dev/null || true
sleep 2

# Copy files using docker cp
echo "=== Copying files into container ==="
cd /tmp/app-staging

# Copy root files
for item in config index.js server.js package.json preload.cjs imagegen.json; do
  if [ -e "/tmp/app-staging/$item" ]; then
    docker cp "/tmp/app-staging/$item" "$CONTAINER:$APP_ROOT/$item"
    echo "  ✅ $item"
  fi
done

# Merge src/ directory
docker cp src/. "$CONTAINER:$APP_ROOT/src/"
echo "  ✅ src/"

# Sync dependencies: npm install on HOST, copy to container
echo "=== Syncing dependencies ==="
rm -rf /tmp/npm-sync && mkdir -p /tmp/npm-sync
docker cp "$CONTAINER:$APP_ROOT/node_modules" /tmp/npm-sync/node_modules 2>/dev/null || mkdir -p /tmp/npm-sync/node_modules
cp /tmp/app-staging/package.json /tmp/npm-sync/package.json
cd /tmp/npm-sync && npm install --production --legacy-peer-deps 2>&1 | tail -5
echo "  Installed $(ls node_modules | wc -l) packages"
docker cp /tmp/npm-sync/node_modules/. "$CONTAINER:$APP_ROOT/node_modules/"
echo "  ✅ Dependencies synced"
rm -rf /tmp/npm-sync

# Start container
echo "=== Starting container ==="
docker start $CONTAINER
sleep 5

# Check status
docker ps --filter name=$CONTAINER

# Cleanup
rm -rf /tmp/app-staging /tmp/app-code.tar.gz
echo "=== Hotfix deploy complete! ==="
