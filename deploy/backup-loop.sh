#!/bin/sh
# สำรองเมื่อเริ่มทำงาน แล้วสำรองซ้ำตามรอบ ถ้าล้มเหลวจะไม่ส่ง ping บริการภายนอกจึงแจ้งเตือนได้
set -u
while :; do
  sh /usr/local/bin/hub-backup || echo "[backup] FAILED"
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
