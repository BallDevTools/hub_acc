#!/usr/bin/env bash
# ใช้: scripts/restore.sh <ชื่อไฟล์ในโฟลเดอร์ backups> [--yes]
# แทนที่ฐานข้อมูลทั้งหมดด้วยไฟล์สำรอง และเก็บข้อมูลปัจจุบันเป็นไฟล์ pre-restore ก่อน
set -euo pipefail
file="$(basename "${1:?ระบุชื่อไฟล์ เช่น hub-20261105T000000Z.dump}")"
. "$(dirname "$0")/prod-lib.sh"

compose exec -T backup pg_restore --list "/backups/$file" > /dev/null \
  || { echo "ไฟล์ /backups/$file อ่านไม่ได้" >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  read -r -p "ข้อมูลปัจจุบันจะถูกแทนที่ด้วย $file พิมพ์ restore เพื่อยืนยัน: " answer
  [ "$answer" = "restore" ] || { echo "ยกเลิก"; exit 1; }
fi

compose exec -T backup sh /usr/local/bin/hub-backup pre-restore
compose stop api worker web

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U hub -d postgres \
  -c 'DROP DATABASE IF EXISTS hub_acc WITH (FORCE)' -c 'CREATE DATABASE hub_acc OWNER hub'
compose exec -T backup pg_restore --no-owner --exit-on-error --dbname=hub_acc "/backups/$file"

# ไฟล์สำรองอาจเก่ากว่าโค้ดปัจจุบัน
compose run --rm migrate
compose up -d --wait api worker web
echo "restore $file สำเร็จ"
