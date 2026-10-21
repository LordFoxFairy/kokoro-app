#!/usr/bin/env bash
set -euo pipefail

: "${KOKORO_API_BASE_URL:?Set KOKORO_API_BASE_URL}"
: "${KOKORO_API_TOKEN:?Set KOKORO_API_TOKEN}"
: "${KOKORO_USER_BEARER:?Set KOKORO_USER_BEARER}"
: "${KOKORO_SESSION_ID:?Set KOKORO_SESSION_ID}"
: "${KOKORO_RUN_ID:?Set KOKORO_RUN_ID}"

curl --silent --show-error --fail-with-body \
  --request POST \
  "${KOKORO_API_BASE_URL}/v1/sessions/${KOKORO_SESSION_ID}/runs/${KOKORO_RUN_ID}/control" \
  --header "content-type: application/json" \
  --header "x-kokoro-service: web-bff" \
  --header "x-kokoro-internal-secret: ${KOKORO_API_TOKEN}" \
  --header "authorization: Bearer ${KOKORO_USER_BEARER}" \
  --header "idempotency-key: example-cancel-run-001" \
  --data '{"kind":"run.cancel"}'

printf '\n'
