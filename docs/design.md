# แบบระบบ hub_acc

## ขอบเขต

คนสมัครบัญชีและยืนยันตัวตนเอง แล้วระบบรับช่วงต่อ ระบบนี้ไม่มีบอทสมัคร Shopee หรือ Facebook

## Stack

| ส่วน | เลือกใช้ |
|---|---|
| Frontend | Next.js, Tailwind CSS, TanStack Query |
| API | Fastify, Zod |
| Worker | Node.js, pg-boss |
| Database | PostgreSQL, Prisma |
| Auth | Google OAuth และ allowlist |
| Secrets | Bitwarden หรือ 1Password โดยระบบเก็บแค่ลิงก์ไปยังรายการรหัสผ่าน |
| Repo และ Deploy | pnpm monorepo, Docker Compose |

## ภาพรวม

```text
Next.js Dashboard
      │ REST
      ▼
Fastify API ───────► PostgreSQL ◄─────── Worker (pg-boss)
                                            │
                         ┌──────────────────┼──────────────┐
                         ▼                  ▼              ▼
                     Gmail API          Meta Graph     Claude API
                     (เช็กผล)          (โพสต์/สถิติ)   (ร่างเนื้อหา)

Shopee report: นำเข้าด้วย CSV ในระยะแรก
```

## โครงสร้าง repo

```text
hub_acc/
├── apps/
│   ├── web/        # Next.js
│   ├── api/        # Fastify
│   └── worker/     # งานหลังบ้าน
├── packages/
│   ├── db/           # Prisma schema
│   ├── integrations/ # Gmail, Meta, Claude และการเข้ารหัส token
│   └── shared/       # Zod schema และ type
├── deploy/           # Caddy และ backup
├── scripts/          # deploy และ restore
├── docker-compose.yml
└── docker-compose.prod.yml
```

## โมดูลหลัก

1. **Accounts:** ทะเบียนเจ้าของบัญชี เมล บัญชี Shopee และ Facebook รวมถึงสถานะ
2. **Onboarding:** checklist ทีละขั้น พร้อมลิงก์และปุ่มคัดลอกข้อมูล
3. **Mail Watcher:** อ่านอีเมลที่เกี่ยวข้องและเสนอการอัปเดตสถานะ
4. **Page Kit:** ร่างชื่อ คำอธิบาย และโพสต์แรก ๆ ให้เลือก
5. **Publisher:** จัดคิวโพสต์ไปยัง Page ที่ให้สิทธิ์ผ่าน Graph API ไว้แล้ว
6. **Reports:** Dashboard งานค้าง สถิติ Page และยอดจาก Shopee

## Database

```text
owners            ─┬─ mailboxes
                   ├─ platform_accounts (shopee | facebook, status)
                   └─ pages

onboarding_tasks  → งาน, ผู้รับผิดชอบ, กำหนดส่ง, สถานะ
email_events      → gmail_message_id (unique), ประเภทเมล, ผลการจับคู่
content_items     → เนื้อหา, สถานะอนุมัติ
post_jobs         → page, เวลาโพสต์, สถานะ, ข้อผิดพลาด
metrics_daily     → page, วันที่, ชื่อเมตริก, ค่าสถิติ
shopee_conversions → คำสั่งซื้อ, sub_id, สถานะ, ยอด, ค่าคอมมิชชัน
notifications     → การแจ้งเตือน และสถานะการส่งออก
oauth_connections → token ที่เข้ารหัสแล้ว
audit_logs        → ใครเปลี่ยนอะไร เมื่อไร
```

## จุดที่ควรระวัง

- **Mail Watcher:** กันอีเมลซ้ำด้วย `gmail_message_id` และถ้าไม่มั่นใจ ให้ส่งเข้าคิวตรวจแทนการเปลี่ยนสถานะเอง
- **Token:** เข้ารหัส token ก่อนลงฐานข้อมูล และขอสิทธิ์เท่าที่จำเป็น
- **Google Admin API:** ยังไม่ได้ทำ สร้างเมลอัตโนมัติได้เฉพาะ Google Workspace ไม่ใช่ Gmail ทั่วไป
- **Meta API:** การโพสต์ต้องใช้สิทธิ์ที่เหมาะสม และแอปอาจต้องผ่าน App Review ถ้าจัดการ Page ของคนนอกทีม
- **Shopee:** ยังไม่ออกแบบโดยคาดว่าจะมี API ให้ใช้ จึงเริ่มจาก CSV ก่อน
- **โพสต์ซ้ำ:** เมื่อไม่รู้ผลการโพสต์ ระบบจะให้คนตรวจแทนการลองซ้ำเอง
- **Adapter:** แยกโค้ดเชื่อมต่อแต่ละแพลตฟอร์มไว้ เพื่อเปลี่ยนภายหลังได้โดยไม่กระทบระบบหลัก

## ลำดับการสร้าง

1. **ฐานระบบ:** ตั้ง monorepo, database, login, ทะเบียนบัญชี และ Dashboard สถานะ
2. **Onboarding:** ทำ checklist, Page Kit และ Mail Watcher
3. **หลังเปิด Page:** ทำคิวโพสต์และการดึงสถิติจาก Meta
4. **Report:** นำเข้า CSV ของ Shopee แล้วรวมเป็น report กับการแจ้งเตือน
5. **ใช้งานจริง:** deploy ด้วย Compose, HTTPS, backup และการตรวจความปลอดภัย
