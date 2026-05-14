#!/bin/bash
# Start a local server for the level editor
# Usage: ./serve.sh [port]
PORT=${1:-8080}
echo "Level Editor running at http://localhost:$PORT"
cd "$(dirname "$0")"
python3 -m http.server $PORT
