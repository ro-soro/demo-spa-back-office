# Demo Spa — Back Office for a Thai Massage & Spa Shop

ระบบหลังบ้านสำหรับร้านนวดและสปา: บันทึกงานนวดรายวัน, ขายคอร์ส, สรุปค่ามือหมอและเงินเดือนรายงวด, ตั้งค่าบริการ/ราคา และจัดการสิทธิ์ผู้ใช้ตาม role

A back-office web app for a Thai massage & spa shop — daily treatment log, course sales, per-period therapist payroll, service/price settings and role-based access.

> All names, customers, bank accounts and figures in the demo are fictional.

## Live demo

**Demo:** https://demo-spa-back-office.vercel.app

The login page shows one-click demo accounts (password `demo1234` for all):

| Username       | Role          | What you can try                                        |
| -------------- | ------------- | ------------------------------------------------------- |
| `demo_super`   | Super Manager | Everything, including managing system users             |
| `demo_manager` | Manager       | Shop settings, prices, course templates, edit past days |
| `demo_admin`   | Admin         | Log today's treatments, view dashboard and payroll      |

Demo data lives only in your browser (localStorage), is regenerated every day around the current date, and can be reset from the login page — so feel free to add, edit and delete anything.

## Features

- **Dashboard** — revenue, therapist commission, net profit, payment channel breakdown, therapist leaderboard and daily / monthly / yearly trend charts (Recharts)
- **Treatment log** — multi-service bookings per round with time-slot ↔ duration auto-calculation, split payments (cash / transfer / card / tip) and a soft warning when the amount received doesn't match the service price
- **Course sales** — course templates with price auto-fill and percentage commission
- **Payroll** — full-time pay with daily guarantee top-up, part-time commission, late-shift allowance, and an append-only ledger that deducts salary advances once per pay period (with a guard against skipping periods)
- **Role-based access** — admin / manager / super-manager, enforced on navigation and on direct URL access, plus session-expiry detection
- **Printable payslips**

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript (strict)
- Tailwind CSS, Framer Motion, TanStack Table, React Hook Form + Zod, Recharts, lucide-react
- Firebase: Cloud Firestore + Firebase Authentication (email/password)
- Vitest + React Testing Library (unit / integration), Playwright (E2E)

## Architecture notes

- `src/utils/db.ts` is the single data-access layer. With Firebase configured it reads and writes Cloud Firestore directly; otherwise it falls back to localStorage (used by unit tests and the public demo).
- `NEXT_PUBLIC_DEMO_MODE=true` switches Firebase off entirely (`src/utils/firebase.ts`), seeds the fictional dataset from `src/data/demoData.ts`, and shows the demo-account box on the login page. The public demo never talks to a real database.
- Login supports two paths: Firebase Auth (email/password) and a username/password check against the `systemUsers` collection.

## Getting started

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_DEMO_MODE=true runs without Firebase
npm run dev
```

To run against your own Firebase project, set `NEXT_PUBLIC_DEMO_MODE=false` and fill in the `NEXT_PUBLIC_FIREBASE_*` values (enable Cloud Firestore and the Email/Password sign-in provider).

| Script             | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Dev server using `.env.local`                    |
| `npm run dev:demo` | Dev server in demo mode (no Firebase)            |
| `npm test`         | Unit / integration tests (Vitest)                |
| `npm run test:e2e` | Playwright E2E against a separate test project   |
| `npm run build`    | Production build                                 |

## Deploying to Vercel

Import the repository in Vercel and add one environment variable:

```
NEXT_PUBLIC_DEMO_MODE=true
```

No Firebase variables are needed for the demo deployment.
