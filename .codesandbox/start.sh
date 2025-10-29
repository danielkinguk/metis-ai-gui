#!/usr/bin/env sh
# POSIX-safe starter; no pipefail/-u
set -e

# repo root (this file lives in .codesandbox/)
cd "$(dirname "$0")/.." || exit 1

# If a venv exists, use it; otherwise fail fast with a helpful message.
if [ -x ".venv/bin/python" ]; then
  . ".venv/bin/activate"
else
  echo "❌ .venv missing. Run the bootstrap once:"
  echo "   bash .codesandbox/bootstrap.sh"
  exit 1
fi

# Load env if present
[ -f ".env" ] && . ".env"

# Ensure chroma dir exists
mkdir -p ./chromadb

# Prefer module path from repo root
export PYTHONPATH=".:${PYTHONPATH:-}"

# Run Flask using venv python
exec python -m flask --app gui.app:app run \
  --host 0.0.0.0 --port 5000
