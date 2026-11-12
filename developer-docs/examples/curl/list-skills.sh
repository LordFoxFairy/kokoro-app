#!/usr/bin/env bash
set -euo pipefail

: "${KOKORO_API_BASE_URL:?Set KOKORO_API_BASE_URL to the public Web origin}"
: "${KOKORO_API_TOKEN:?Set KOKORO_API_TOKEN}"

curl --silent --show-error --fail-with-body \
  "${KOKORO_API_BASE_URL}/v1/skill.list" \
  --header "accept: application/json" \
  --header "authorization: Bearer ${KOKORO_API_TOKEN}"

printf '\n'
