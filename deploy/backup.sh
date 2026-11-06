#!/bin/sh
# สำรองฐานข้อมูล 1 ครั้ง เขียนลงไฟล์ชั่วคราวก่อน และลบไฟล์เก่าหลังตรวจไฟล์ใหม่แล้วเท่านั้น
set -eu
umask 077

prefix="${1:-hub}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="/backups/${prefix}-${stamp}.dump"
tmp="${target}.partial"
trap 'rm -f "$tmp"' EXIT

pg_dump --format=custom --no-owner --file="$tmp"
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$target"
echo "[backup] wrote $target ($(wc -c < "$target") bytes)"

if [ "$prefix" = "hub" ]; then
  find /backups -maxdepth 1 -name 'hub-*.dump' -mtime "+${BACKUP_KEEP_DAYS:-14}" -print -delete
  if [ -n "${BACKUP_PING_URL:-}" ]; then
    wget -q -T 10 -O /dev/null "$BACKUP_PING_URL" || echo "[backup] ping failed"
  fi
fi
