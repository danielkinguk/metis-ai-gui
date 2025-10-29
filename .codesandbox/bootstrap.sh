#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."  # repo root

# Use existing Python if it's 3.12+, otherwise try pyenv
if python3 -c 'import sys; exit(0 if sys.version_info[:2]>= (3,12) else 1)'; then
  PYBIN=python3
elif command -v pyenv >/dev/null 2>&1; then
  eval "$(pyenv init -)"
  pyenv install -s 3.12.6
  pyenv local 3.12.6
  PYBIN=python
else
  # quick pyenv install (bash environment)
  curl -fsSL https://pyenv.run | bash
  export PYENV_ROOT="$HOME/.pyenv"
  export PATH="$PYENV_ROOT/bin:$PYENV_ROOT/shims:$PATH"
  eval "$(pyenv init -)"
  pyenv install -s 3.12.6
  pyenv local 3.12.6
  PYBIN=python
fi

# Create venv + deps
$PYBIN -m venv .venv
. .venv/bin/activate
python -m pip install -U pip setuptools wheel
pip install -e .
pip install -r gui/requirements.txt
pip install -U pysqlite3-binary

# SQLite shim
python - <<'PY'
import site, pathlib, textwrap
code = textwrap.dedent("""
  import sys, pysqlite3
  sys.modules['sqlite3'] = pysqlite3
  sys.modules['sqlite3.dbapi2'] = pysqlite3.dbapi2
""").lstrip()
pathlib.Path("sitecustomize.py").write_text(code)
pathlib.Path(site.getsitepackages()[0], "sitecustomize.py").write_text(code)
PY

echo "✅ Bootstrap complete. Next time just run: yarn start"
