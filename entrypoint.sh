#!/bin/sh

set -e

if [ "$UPR_WORKER_MODE" = "enrichment" ]; then
  echo "INFO: Starting Enrichment Worker with Express server shim..."
  exec node workers/enrichmentServer.js
else
  echo "INFO: Starting Web Service process..."
  exec node server.js
fi