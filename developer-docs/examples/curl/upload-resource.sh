#!/usr/bin/env bash
set -euo pipefail

: "${KOKORO_API_BASE_URL:?Set KOKORO_API_BASE_URL}"
: "${KOKORO_INTERNAL_SECRET:?Set KOKORO_INTERNAL_SECRET}"
: "${KOKORO_SESSION_COOKIE:?Set KOKORO_SESSION_COOKIE}"
: "${KOKORO_WEB_ORIGIN:?Set KOKORO_WEB_ORIGIN}"
: "${KOKORO_PROJECT_ID:?Set KOKORO_PROJECT_ID}"
: "${EXAMPLE_FILE:?Set EXAMPLE_FILE to a local file}"

curl --silent --show-error --fail-with-body \
  --request POST \
  "${KOKORO_API_BASE_URL}/v1/projects/${KOKORO_PROJECT_ID}/resources" \
  --header "x-kokoro-service: web-bff" \
  --header "x-kokoro-internal-secret: ${KOKORO_INTERNAL_SECRET}" \
  --header "cookie: ${KOKORO_SESSION_COOKIE}" \
    --header "origin: ${KOKORO_WEB_ORIGIN}" \
  --header "idempotency-key: example-upload-resource-001" \
  --form "files=@${EXAMPLE_FILE}"

printf '\n'
