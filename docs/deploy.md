# คู่มือ Deploy

ระบบรันบน VPS เครื่องเดียวด้วย Docker Compose โดยมี Caddy ทำ HTTPS ให้อัตโนมัติ

## สิ่งที่ต้องมี

- VPS ที่ติดตั้ง Docker และ Compose แนะนำ RAM 4 GB และดิสก์ 40 GB ขึ้นไป เพราะการ build ใช้ทรัพยากรมาก
- โดเมนที่ตั้ง DNS ชี้มาที่ VPS แล้ว
- เปิด port 80 และ 443

## ติดตั้งครั้งแรก

```bash
git clone https://github.com/BallDevTools/hub_acc.git
cd hub_acc
cp .env.production.example .env.production
chmod 600 .env.production
# แก้ .env.production ตามคำอธิบายในไฟล์
scripts/deploy.sh v1.0.0
```

เปิด `https://โดเมน` แล้วเข้าสู่ระบบด้วย Google โดยใช้อีเมลใน `ADMIN_EMAILS`

เก็บ `TOKEN_ENCRYPTION_KEY` และรหัสผ่านใน password manager ด้วย ถ้ากุญแจหาย ข้อมูลยังอยู่ แต่ต้องเชื่อม Gmail และ Facebook ใหม่ทั้งหมด

## ตั้งค่าบริการภายนอก

ทุกบริการเป็นตัวเลือก ถ้าไม่ตั้ง ระบบส่วนอื่นยังใช้งานได้ และหน้าเว็บจะบอกว่าส่วนนั้นยังไม่ได้ตั้งค่า

### Google (login และ Gmail)

1. สร้าง OAuth client ชนิด Web application ใน Google Cloud Console
2. เพิ่ม redirect URI 2 รายการ
   - `https://โดเมน/api/auth/google/callback`
   - `https://โดเมน/api/connections/google/callback`
3. เปิด Gmail API และเพิ่ม scope `gmail.readonly` ใน OAuth consent screen
4. ถ้าแอปอยู่ในโหมด Testing ให้เพิ่มเมลที่จะเชื่อมเป็น test user ซึ่ง Google จะหมดอายุสิทธิ์ของโหมดนี้ทุก 7 วัน การใช้งานระยะยาวต้องเผยแพร่แอปและอาจต้องผ่านการตรวจสอบของ Google

### Claude (Page Kit)

ใส่ `ANTHROPIC_API_KEY` ระบบใช้ `claude-opus-5-5` และเปิด server-side fallback เพื่อให้ยังร่างได้เมื่อโมเดลหลักไม่พร้อม เปลี่ยนโมเดลได้ด้วย `CLAUDE_MODEL`

### Meta (โพสต์และสถิติ)

1. สร้าง Meta App แล้วเพิ่ม Facebook Login
2. เพิ่ม redirect URI `https://โดเมน/api/connections/meta/callback`
3. ขอสิทธิ์ `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` และ `read_insights`
4. ถ้าจัดการ Page ของคนนอกทีม แอปต้องผ่าน App Review

ก่อนใช้งานจริง ให้ตรวจชื่อเมตริกใน `META_INSIGHT_METRICS` กับ[เอกสาร Page Insights](https://developers.facebook.com/docs/graph-api/reference/insights/) เพราะ Meta ยกเลิกเมตริกเดิมหลายตัว ถ้าเมตริกใดใช้ไม่ได้ ระบบจะแจ้งเตือนและดึงตัวอื่นต่อ

### การแจ้งเตือน

| ค่า | ใช้ทำอะไร |
|---|---|
| `NOTIFY_WEBHOOK_URL` | ส่งการแจ้งเตือนและสรุปประจำวันเข้า Slack หรือ Discord |
| `HEALTHCHECK_PING_URL` | worker ping ทุกนาที ใช้จับว่าระบบหรือฐานข้อมูลล่ม |
| `BACKUP_PING_URL` | ping เมื่อสำรองข้อมูลสำเร็จ ใช้จับว่า backup หยุดทำงาน |

ตั้ง `HEALTHCHECK_PING_URL` และ `BACKUP_PING_URL` กับบริการอย่าง [healthchecks.io](https://healthchecks.io/) เพราะเครื่องที่ล่มแจ้งเตือนตัวเองไม่ได้ ควรตั้งตัวตรวจ `https://โดเมน/api/health` จากภายนอกด้วย

## อัปเดตเป็นรุ่นใหม่

```bash
scripts/deploy.sh v1.1.0
```

สคริปต์จะสำรองฐานข้อมูลเป็น `backups/pre-deploy-*.dump`, build รุ่นนั้น, รัน migration, เริ่มระบบ และตรวจสุขภาพก่อนรายงานว่าสำเร็จ ระหว่างนี้ระบบจะหยุดให้บริการสั้น ๆ

## Rollback

```bash
scripts/deploy.sh v1.0.0
```

Migration ไม่ย้อนกลับเอง ถ้ารุ่นที่ rollback ออกมาเปลี่ยนโครงสร้างฐานข้อมูล และรุ่นเก่าทำงานไม่ได้ ให้ restore ไฟล์ `pre-deploy` ที่สร้างก่อนอัปเดตรุ่นนั้นด้วย ข้อมูลที่เกิดหลังไฟล์นั้นจะหายไป

## Backup

ระบบสำรองทันทีเมื่อเริ่มทำงาน แล้วสำรองซ้ำทุก 24 ชั่วโมงลงโฟลเดอร์ `backups/` และเก็บไฟล์ `hub-*.dump` ไว้ 14 วัน

สำรองทันที:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec backup sh /usr/local/bin/hub-backup
```

ไฟล์สำรองอยู่บนเครื่องเดียวกับฐานข้อมูล จึงไม่ช่วยถ้าเครื่องเสีย ต้องคัดลอกไปเก็บที่อื่นเป็นประจำ เช่น object storage แบบเข้ารหัส ไฟล์สำรองมีข้อมูลเจ้าของบัญชีและ token ที่เข้ารหัสแล้ว ห้ามเก็บ `TOKEN_ENCRYPTION_KEY` ไว้ที่เดียวกับไฟล์เหล่านี้

## Restore

```bash
ls backups
scripts/restore.sh hub-20261105T000000Z.dump
```

ต้องพิมพ์ `restore` เพื่อยืนยัน สคริปต์จะเก็บข้อมูลปัจจุบันเป็น `pre-restore-*.dump` ก่อน จึงย้อนการ restore ได้

ควรซ้อม restore บนเครื่องทดสอบอย่างน้อยไตรมาสละครั้ง

## ตรวจสอบและแก้ปัญหา

```bash
alias hub='docker compose --env-file .env.production -f docker-compose.prod.yml'
hub ps
hub logs -f --tail=100 api worker
```

| อาการ | ตรวจที่ |
|---|---|
| เว็บขึ้น 502 | `hub ps` ดูว่า api และ web เป็น healthy หรือไม่ แล้วดู `hub logs api` |
| ใบรับรอง HTTPS ไม่ออก | DNS ชี้ถูกเครื่องหรือไม่ และ port 80 กับ 443 เปิดหรือไม่ ดู `hub logs caddy` |
| worker เป็น unhealthy | `hub logs worker` และตรวจการเชื่อมต่อฐานข้อมูล |
| โพสต์ไม่ขึ้น | หน้า “คิวโพสต์” บอกสาเหตุของแต่ละรายการ |
| Log เต็มดิสก์ | Docker จำกัด log ไว้ service ละ 100 MB อยู่แล้ว ให้ดู `backups/` และ `docker system df` |

## ข้อจำกัดของการติดตั้งแบบนี้

- มีเครื่องเดียว ถ้าเครื่องล่ม ระบบจะหยุดจนกว่าจะกู้คืน
- Build บนเครื่อง production ทำให้ deploy ใช้เวลาหลายนาที ถ้าใช้จริงจังควรย้ายไป build image ใน CI
- App image มีขนาดใหญ่ราว 2.5 GB เพราะเก็บเครื่องมือสำหรับรัน TypeScript และ migration ไว้ด้วย
