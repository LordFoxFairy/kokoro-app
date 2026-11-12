#!/usr/bin/env bash
set -euo pipefail

: "${KOKORO_API_BASE_URL:?Set KOKORO_API_BASE_URL}"
: "${KOKORO_INTERNAL_SECRET:?Set KOKORO_INTERNAL_SECRET}"
: "${KOKORO_SESSION_COOKIE:?Set KOKORO_SESSION_COOKIE}"
: "${KOKORO_WEB_ORIGIN:?Set KOKORO_WEB_ORIGIN}"
: "${KOKORO_SESSION_ID:?Set KOKORO_SESSION_ID}"
: "${KOKORO_RUN_ID:?Set KOKORO_RUN_ID}"

curl --silent --show-error --fail-with-body \
  --request POST \
  "${KOKORO_API_BASE_URL}/v1/sessions/${KOKORO_SESSION_ID}/runs/${KOKORO_RUN_ID}/control" \
  --header "content-type: application/json" \
  --header "x-kokoro-service: web-bff" \
  --header "x-kokoro-internal-secret: ${KOKORO_INTERNAL_SECRET}" \
  --header "cookie: ${KOKORO_SESSION_COOKIE}" \
    --header "origin: ${KOKORO_WEB_ORIGIN}" \
  --header "idempotency-key: example-cancel-run-001" \
  --data '{"kind":"run.cancel"}'

printf '\n'
