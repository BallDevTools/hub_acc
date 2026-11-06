# hub_acc

ระบบดูแลบัญชี เมล Shopee Affiliate และ Facebook Page พร้อม Dashboard สำหรับดูสถานะและ report

> สถานะ: เขียนโค้ดครบทุกเฟสแล้ว แต่ยังไม่ได้ทดสอบกับ Google, Meta, Claude และไฟล์ Shopee จริง ดูรายการที่เหลือได้ที่ [docs/roadmap.md](docs/roadmap.md)

## เอกสาร

- [คู่มือใช้งาน](docs/usage.md)
- [คู่มือ deploy, backup และ rollback](docs/deploy.md)
- [ผลตรวจความปลอดภัย](docs/security.md)
- [แบบระบบ](docs/design.md)

## ขอบเขต

ระบบช่วยเตรียมข้อมูล ติดตามสถานะ จัดคิวโพสต์ และรวม report ส่วนการสมัครบัญชีแพลตฟอร์มและการยืนยันตัวตนให้เจ้าของบัญชีทำเอง

## Stack

Next.js, Tailwind CSS, Fastify, pg-boss, PostgreSQL, Prisma, pnpm, Docker Compose และ Caddy

## เริ่มใช้งานบนเครื่อง

ต้องมี Node.js 22.12 ขึ้นไป และ Docker

```bash
corepack enable pnpm
cp .env.example .env
docker compose up -d --wait postgres
pnpm install
pnpm db:deploy
pnpm dev
```

จากนั้นเปิด <http://localhost:3000> แล้วเข้าสู่ระบบด้วยอีเมลที่ตั้งไว้ใน `ADMIN_EMAILS`

บริการภายนอกทั้งหมดเป็นตัวเลือก ตั้งค่าได้ใน `.env` ตามคำอธิบายใน `.env.example`

Google login ต้องใส่ `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` ใน `.env` และเพิ่ม redirect URI `http://localhost:3000/api/auth/google/callback` ใน Google Cloud Console

## คำสั่งตรวจสอบ

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` ใช้ฐานข้อมูลแยกตาม `TEST_DATABASE_URL` ซึ่งต้องลงท้ายด้วย `_test` และข้อมูลในนั้นจะถูกล้างทุกครั้ง

## Release

ใช้ [Semantic Versioning](https://semver.org/) และสร้าง GitHub Release เมื่อจบแต่ละงานที่ใช้งานได้
