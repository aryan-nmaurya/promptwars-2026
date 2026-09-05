#!/bin/sh
# Lint gate for the API. Zero warnings is the bar.
set -e

API_PYTHON=python
if [ -x .venv/bin/python ]; then
  API_PYTHON=.venv/bin/python
fi

"$API_PYTHON" -m ruff check .
"$API_PYTHON" -m ruff format --check .
"$API_PYTHON" -m pytest
