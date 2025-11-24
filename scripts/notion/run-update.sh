#!/bin/bash
source .env
export NOTION_API_KEY=$NOTION_TOKEN
node scripts/notion/completeSprints30and31.js
