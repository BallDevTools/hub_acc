#!/usr/bin/env bash
# ใช้: scripts/deploy.sh <tag>  ทั้ง deploy รุ่นใหม่และ rollback ไปรุ่นเก่า
set -euo pipefail
ref="${1:?ระบุ tag เช่น scripts/deploy.sh v1.0.0}"
. "$(dirname "$0")/prod-lib.sh"

git fetch --tags origin

# สำรองก่อน migrate เสมอ เพราะ migration ย้อนกลับเองไม่ได้
if [ -n "$(compose ps -q --status running postgres backup 2>/dev/null | sed -n 2p)" ]; then
  compose exec -T backup sh /usr/local/bin/hub-backup "pre-deploy-${ref//\//-}"
fi

git checkout --detach "$ref"
compose build
compose up -d --wait postgres
compose run --rm migrate
compose up -d --wait --remove-orphans api worker web caddy backup
compose ps

# ตรวจเส้นทางจริงตั้งแต่ Caddy ถึงฐานข้อมูล ก่อนรายงานว่าสำเร็จ
domain="$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)"
compose exec -T caddy wget -q -O /dev/null --no-check-certificate --header "Host: $domain" https://localhost/api/health \
  || compose exec -T caddy sh -c "wget -q -O /dev/null http://api:4000/api/health" \
  || { echo "ตรวจสุขภาพระบบไม่ผ่าน" >&2; exit 1; }
echo "deploy $ref สำเร็จ"
