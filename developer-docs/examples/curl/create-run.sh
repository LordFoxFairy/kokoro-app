#!/usr/bin/env bash
set -euo pipefail

: "${KOKORO_API_BASE_URL:?Set KOKORO_API_BASE_URL}"
: "${KOKORO_API_TOKEN:?Set KOKORO_API_TOKEN}"
: "${KOKORO_USER_BEARER:?Set KOKORO_USER_BEARER}"
: "${KOKORO_SESSION_ID:?Set KOKORO_SESSION_ID}"

response="$(
  curl --silent --show-error --fail-with-body \
    --request POST \
    "${KOKORO_API_BASE_URL}/v1/sessions/${KOKORO_SESSION_ID}/messages" \
    --header "content-type: application/json" \
    --header "x-kokoro-service: web-bff" \
    --header "x-kokoro-internal-secret: ${KOKORO_API_TOKEN}" \
    --header "authorization: Bearer ${KOKORO_USER_BEARER}" \
    --header "idempotency-key: example-create-run-001" \
    --data '{
      "content": "Review the public API contract.",
      "model": "default",
      "project_ref": "project_example"
    }'
)"

printf '%s\n' "$response" | python3 -c '
import json
import sys

payload = json.load(sys.stdin)
print(payload["data"]["run_id"])
'
