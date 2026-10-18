#!/usr/bin/env bash
# Krato CI scan — run this in any CI pipeline (GitHub Actions, GitLab, Vercel, etc.)
# Usage: KRATO_API_KEY=krato_xxx ./krato-ci.sh https://your-site.com [critical|medium|any]

set -e

URL="$1"
FAIL_ON="${2:-critical}"

if [ -z "$URL" ]; then
  echo "Usage: KRATO_API_KEY=krato_xxx ./krato-ci.sh <url> [critical|medium|any]"
  exit 1
fi

if [ -z "$KRATO_API_KEY" ]; then
  echo "Error: KRATO_API_KEY env var not set (get one from the Krato dashboard)"
  exit 1
fi

response=$(curl -s -w "\n%{http_code}" -X POST https://kratoai.vercel.app/api/ci/scan \
  -H "Authorization: Bearer $KRATO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"failOn\":\"$FAIL_ON\"}")

body=$(echo "$response" | sed '$d')
echo "$body" | jq .

passed=$(echo "$body" | jq -r '.passed')

if [ "$passed" != "true" ]; then
  echo "❌ Krato scan found blocking issues — failing build"
  exit 1
fi

echo "✅ Krato scan passed"
