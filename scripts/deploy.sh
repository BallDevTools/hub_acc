#!/usr/bin/env bash
# ใช้: scripts/deploy.sh <tag>  ทั้ง deploy รุ่นใหม่และ rollback ไปรุ่นเก่า
set -euo pipefail

# ขั้นแรกรันจากรุ่นที่ติดตั้งอยู่ แล้วสลับไปใช้สคริปต์ของรุ่นปลายทางสำหรับขั้นที่เหลือ
prepare() {
  local ref="$1"
  git fetch --tags origin

  # สำรองก่อน migrate เสมอ เพราะ migration ย้อนกลับเองไม่ได้
  if [ -n "$(compose ps -q --status running postgres backup 2>/dev/null | sed -n 2p)" ]; then
    compose exec -T backup sh /usr/local/bin/hub-backup "pre-deploy-${ref//\//-}"
  fi

  git checkout --detach "$ref"
  exec "$repo_root/scripts/deploy.sh" --apply "$ref"
}

apply() {
  local ref="$1"
  compose build
  compose up -d --wait postgres
  compose run --rm migrate
  compose up -d --wait --remove-orphans api worker web
  # ไฟล์ที่ mount เข้า container เปลี่ยนตาม git checkout แต่ Compose มองไม่เห็น จึงต้องสร้างใหม่เสมอ
  compose up -d --wait --force-recreate caddy backup
  compose ps

  # ตรวจเส้นทางจาก Caddy ถึง API และฐานข้อมูล ก่อนรายงานว่าสำเร็จ
  compose exec -T caddy wget -q -O /dev/null http://api:4000/api/health \
    || { echo "ตรวจสุขภาพระบบไม่ผ่าน" >&2; exit 1; }
  echo "deploy $ref สำเร็จ"
}

main() {
  . "$(dirname "${BASH_SOURCE[0]}")/prod-lib.sh"
  if [ "${1:-}" = "--apply" ]; then
    apply "${2:?}"
  else
    prepare "${1:?ระบุ tag เช่น scripts/deploy.sh v1.0.0}"
  fi
}

# เรียกจากบรรทัดสุดท้าย เพื่อให้ bash อ่านทั้งไฟล์ก่อนเริ่มทำงาน เพราะ git checkout จะแทนที่ไฟล์นี้
main "$@"
