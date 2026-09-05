#!/bin/sh
# Lint gate for the API. Zero warnings is the bar.
set -e
ruff check .
ruff format --check .
pytest -q
