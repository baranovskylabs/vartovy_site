#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-https://vartovy.app/api/pro-sale-webhook}"
SECRET="${PRO_SALES_WEBHOOK_SECRET:-}"
QTY="${2:-1}"

if [[ -z "${SECRET}" ]]; then
  echo "Set PRO_SALES_WEBHOOK_SECRET first."
  echo "Example: export PRO_SALES_WEBHOOK_SECRET='your-secret'"
  exit 1
fi

EVENT_ID="manual-$(date +%s)-$RANDOM"

curl -sS -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Vartovy-Webhook-Secret: ${SECRET}" \
  --data "{\"event\":\"payment.succeeded\",\"product\":\"pro\",\"quantity\":${QTY},\"event_id\":\"${EVENT_ID}\"}"

echo
