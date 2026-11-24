# Database Schema Design — Demo Spa & Massage Back Office

## 1. Introduction

**Phase:** Phase 1 — Design only. No implementation yet.

**Target database:** PostgreSQL. Chosen because it pairs cleanly with the Next.js hosting
candidates listed in the root `AGENTS.md` (Supabase, Neon, Railway all offer managed
PostgreSQL), and its native support for `NUMERIC` (exact decimal money math), `CHECK`
constraints, and enum types fits this domain well.

**Guiding principle:** stay as close as possible to the existing TypeScript interfaces in
`src/data/initialData.ts` so the Frontend team's types, forms, and components need minimal
changes when the real backend replaces the `localStorage` mock adapter (`src/utils/db.ts`).
Wherever a table maps to an interface, column names mirror the TS field names (in
`snake_case`, the PostgreSQL convention) so the eventual API layer can do a thin
1:1 transform instead of a deep remapping.

This document only proposes table shapes and relationships. It does not include SQL DDL
files, ORM models (Prisma/Drizzle/etc.), or migrations — see item 5 at the end.

---

## 2. Tables

### 2.1 `service_categories`

Maps to: `ServiceCategory` interface.

| Column        | Type          | Constraints                                                                                                                      |
| ------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `TEXT`        | PK (keeps existing string ids like `cat_1` so seed data / existing bookings referencing category names by string are unaffected) |
| `name`        | `TEXT`        | NOT NULL, UNIQUE — maps to `ServiceCategory.name`                                                                                |
| `description` | `TEXT`        | NOT NULL DEFAULT `''` — maps to `ServiceCategory.description`                                                                    |
| `color_class` | `TEXT`        | NOT NULL — maps to `ServiceCategory.colorClass`                                                                                  |
| `created_at`  | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()`                                                                                                         |

### 2.2 `services`

Maps to: `Service` interface.

| Column        | Type            | Constraints                                                                                                                    |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | `TEXT`          | PK — keeps existing ids like `srv_5`                                                                                           |
| `category_id` | `TEXT`          | FK → `service_categories(id)`, NULLABLE (see Open Question 1 — current mock data has empty-string categories on many services) |
| `name`        | `TEXT`          | NOT NULL — maps to `Service.name`                                                                                              |
| `duration`    | `NUMERIC(4,2)`  | NOT NULL DEFAULT 1.0, CHECK (`duration > 0`) — maps to `Service.duration`                                                      |
| `price`       | `NUMERIC(10,2)` | NOT NULL, CHECK (`price >= 0`) — maps to `Service.price`                                                                       |
| `commission`  | `NUMERIC(10,2)` | NOT NULL, CHECK (`commission >= 0`) — maps to `Service.commission`                                                             |
| `created_at`  | `TIMESTAMPTZ`   | NOT NULL DEFAULT `now()`                                                                                                       |

Note: `Service.category` in the TS interface is currently a free-text string (and often
empty), not a strict FK to `ServiceCategory.id`/`name`. Modeled here as a nullable FK to
keep data integrity going forward, but see Open Question 1 for how to reconcile legacy rows.

### 2.3 `therapists`

Maps to: `Therapist` interface.

| Column              | Type                                                  | Constraints                                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `TEXT`                                                | PK — keeps existing ids like `ther_1`                                                                                                                                                                                                                |
| `name`              | `TEXT`                                                | NOT NULL, UNIQUE — maps to `Therapist.name`. UNIQUE because `Booking.therapistName`, `CourseSale.therapistName`, and `SystemUser.linkedTherapistName` all reference therapists **by name** in the current mock data, not by id (see Open Question 2) |
| `type`              | `therapist_type` (ENUM: `'full-time'`, `'part-time'`) | NOT NULL — maps to `Therapist.type`                                                                                                                                                                                                                  |
| `daily_guarantee`   | `NUMERIC(10,2)`                                       | NOT NULL, CHECK (`daily_guarantee >= 0`) — maps to `Therapist.dailyGuarantee`                                                                                                                                                                        |
| `bank_name`         | `TEXT`                                                | NULLABLE — maps to `Therapist.bankName`                                                                                                                                                                                                              |
| `bank_account`      | `TEXT`                                                | NULLABLE — maps to `Therapist.bankAccount`                                                                                                                                                                                                           |
| `bank_account_name` | `TEXT`                                                | NULLABLE — maps to `Therapist.bankAccountName`                                                                                                                                                                                                       |
| `phone`             | `TEXT`                                                | NULLABLE — maps to `Therapist.phone`                                                                                                                                                                                                                 |
| `works_late_shift`  | `BOOLEAN`                                             | NOT NULL DEFAULT `false` — maps to `Therapist.worksLateShift`. เมื่อเป็น `true` จะได้รับค่ากะดึกอัตโนมัติทุกงวดตามเรทกลาง (`app_settings.late_shift_rate`)                                                                                            |
| `advance_deduction_total` | `NUMERIC(10,2)`                                 | NOT NULL DEFAULT `0`, CHECK (`advance_deduction_total >= 0`) — maps to `Therapist.advanceDeductionTotal` (เดิมชื่อ `advance_deduction`/`Therapist.advanceDeduction`). ยอดสะสมทั้งหมดที่พนักงานเบิกล่วงหน้า/กู้ยืม **ไม่ถูกหักออกจากเงินเดือนตรงๆ อีกต่อไป** เป็นเพียงยอดตั้งต้นให้ระบบคำนวณหักอัตโนมัติทีละงวดจาก `advance_deduction_per_period` จนกว่าจะครบ (ดู `advance_deduction_ledger` ด้านล่าง) — เมื่อมีการเบิกเพิ่มให้บวกสะสมเข้ายอดนี้ ไม่ใช่แทนที่ยอดเดิม |
| `advance_deduction_per_period` | `NUMERIC(10,2)`                            | NOT NULL DEFAULT `0`, CHECK (`advance_deduction_per_period >= 0`) — maps to `Therapist.advanceDeductionPerPeriod`. จำนวนเงินที่ระบบหักอัตโนมัติทุกงวดบัญชี จนกว่ายอดคงเหลือใน `advance_deduction_total` จะหมด (งวดสุดท้ายอาจหักน้อยกว่านี้ถ้ายอดคงเหลือไม่พอ) |

**Revised (2026-07-06, Backend team decision):** Originally marked NOT NULL, but revised to nullable —
a new therapist can be registered same-day before their bank/KYC details are ready, and none of these
fields feed into any payroll calculation (unlike `name`, `type`, `daily_guarantee`, which every commission/
guarantee formula depends on directly and must stay required). The Frontend form (`src/app/settings/page.tsx`)
already treats these as optional to match.
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` |

### 2.3a `advance_deduction_ledger`

Maps to: `AdvanceDeductionLedgerEntry` interface (new — added 2026-07-08 for the "หักเบิกต่องวด"
feature). Records one row per pay period per therapist the moment the payroll page auto-applies
that period's deduction, so re-opening/re-filtering the same date range never deducts twice.

| Column             | Type            | Constraints                                                                                                                         |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`               | `TEXT`          | PK — deterministic id built from `therapist_id` + period (e.g. `advled_ther_1_2026-07-01_2026-07-15`) so it doubles as an idempotency key |
| `therapist_id`     | `TEXT`          | FK → `therapists(id)`, NOT NULL                                                                                                     |
| `therapist_name`   | `TEXT`          | NOT NULL — denormalized snapshot for display, same rationale as `booking_services.service_name`                                     |
| `period_start`     | `DATE`          | NOT NULL — maps to `AdvanceDeductionLedgerEntry.periodStart`                                                                        |
| `period_end`       | `DATE`          | NOT NULL — maps to `AdvanceDeductionLedgerEntry.periodEnd`                                                                          |
| `amount_deducted`  | `NUMERIC(10,2)` | NOT NULL, CHECK (`amount_deducted >= 0`) — actual amount deducted this period (may be less than `advance_deduction_per_period` on the final payoff period) |
| `remaining_after`  | `NUMERIC(10,2)` | NOT NULL, CHECK (`remaining_after >= 0`) — `therapists.advance_deduction_total` minus every `amount_deducted` recorded so far for this therapist, snapshotted at write time for audit |
| `created_at`       | `TIMESTAMPTZ`   | NOT NULL DEFAULT `now()`                                                                                                            |

**Constraint:** `UNIQUE (therapist_id, period_start, period_end)` — guarantees one deduction
per therapist per period at the database level, independent of the `id` idempotency key above
(defense in depth against duplicate application logic).

**Why a ledger instead of decrementing `advance_deduction_total` in place:** the payroll page
has no "confirm/close period" step — it recomputes live from `bookings`/`course_sales` for
whatever date range is selected. Mutating the running total directly would make it impossible
to tell whether a given period's deduction was already applied, and viewing the same period
twice would double-deduct. An append-only ledger makes remaining balance a pure derived value
(`advance_deduction_total - SUM(amount_deducted)`) and each period idempotent by construction.

### 2.4 `bookings`

Maps to: `Booking` interface (excluding the `services` array and `payment` object, split out
below).

| Column             | Type            | Constraints                                                                                                                                                                                               |
| ------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `TEXT`          | PK — keeps existing composite-looking ids like `bkg_2026-05-26_0_4`                                                                                                                                       |
| `date`             | `DATE`          | NOT NULL — maps to `Booking.date` (stored as SQL `DATE`, serialized back to `YYYY-MM-DD` string at the API layer to match the TS type)                                                                    |
| `round`            | `SMALLINT`      | NOT NULL, CHECK (`round >= 1`) — maps to `Booking.round`                                                                                                                                                  |
| `therapist_id`     | `TEXT`          | FK → `therapists(id)`, NOT NULL — replaces the free-text `therapistName`; API layer joins to resolve the display name so `Booking.therapistName` in the frontend type is unaffected (see Open Question 2) |
| `time_slot`        | `TEXT`          | NOT NULL DEFAULT `''` — maps to `Booking.timeSlot` (kept as free text; mock data shows both `"9.50-10.50"` formats and empty strings, not a strict time range)                                            |
| `payment_cash`     | `NUMERIC(10,2)` | NOT NULL DEFAULT `0`, CHECK (`payment_cash >= 0`) — maps to `Booking.payment.cash`                                                                                                                        |
| `payment_transfer` | `NUMERIC(10,2)` | NOT NULL DEFAULT `0`, CHECK (`payment_transfer >= 0`) — maps to `Booking.payment.transfer`                                                                                                                |
| `payment_card`     | `NUMERIC(10,2)` | NOT NULL DEFAULT `0`, CHECK (`payment_card >= 0`) — maps to `Booking.payment.card`                                                                                                                        |
| `payment_tip`      | `NUMERIC(10,2)` | NOT NULL DEFAULT `0`, CHECK (`payment_tip >= 0`) — maps to `Booking.payment.tip`                                                                                                                          |
| `customer_name`    | `TEXT`          | NOT NULL DEFAULT `''` — maps to `Booking.customerName`                                                                                                                                                    |
| `remark`           | `TEXT`          | NOT NULL DEFAULT `''` — maps to `Booking.remark`                                                                                                                                                          |
| `update_date`      | `TIMESTAMPTZ`   | NOT NULL DEFAULT `now()` — maps to `Booking.updateDate`                                                                                                                                                   |
| `update_by`        | `TEXT`          | NOT NULL — maps to `Booking.updateBy`                                                                                                                                                                     |

**Why `Payment` is flattened into 4 columns instead of a separate table:** `Payment` has no
identity of its own — it's a value object always owned 1:1 by a `Booking`, never queried or
listed independently, and has a fixed small shape (4 numeric fields). A separate
`booking_payments` table would add a join for every booking read with zero normalization
benefit (per the "Cost-Effective Abstraction" rule — no unnecessary layer). The API layer
reassembles these 4 columns into the nested `Payment` object shape the frontend expects.

### 2.5 `booking_services`

Maps to: `Booking.services: BookingService[]` (join table).

| Column         | Type                                  | Constraints                                                                                                                                                                                                             |
| -------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `BIGINT GENERATED ALWAYS AS IDENTITY` | PK — synthetic surrogate key, not exposed to frontend types directly                                                                                                                                                    |
| `booking_id`   | `TEXT`                                | FK → `bookings(id)` ON DELETE CASCADE, NOT NULL                                                                                                                                                                         |
| `service_id`   | `TEXT`                                | FK → `services(id)`, NOT NULL — maps to `BookingService.serviceId`                                                                                                                                                      |
| `service_name` | `TEXT`                                | NOT NULL — maps to `BookingService.serviceName` (denormalized snapshot, see note below)                                                                                                                                 |
| `price`        | `NUMERIC(10,2)`                       | NOT NULL, CHECK (`price >= 0`) — maps to `BookingService.price` (snapshot)                                                                                                                                              |
| `commission`   | `NUMERIC(10,2)`                       | NOT NULL, CHECK (`commission >= 0`) — maps to `BookingService.commission` (snapshot)                                                                                                                                    |
| `quantity`     | `NUMERIC(5,2)`                        | NOT NULL, CHECK (`quantity > 0`) — maps to `BookingService.quantity`. `NUMERIC` (not `INTEGER`) because mock data has fractional quantities such as `0.5` and `1.5` (used to represent half/extended-duration sessions) |
| `line_order`   | `SMALLINT`                            | NOT NULL DEFAULT `0` — preserves the array order of `services[]` since SQL rows have no inherent order; API layer sorts by this when reassembling the array                                                             |

**Why a join table instead of a JSON column:** `BookingService[]` is a genuine one-to-many
relationship (a booking can have 1..N service lines, each referencing a real `services` row)
and the app needs to aggregate across it (e.g., total commission per therapist per day,
which service sells most). A `JSONB` blob would make that kind of aggregate query and
referential integrity (FK to `services`) much harder, so a proper join table is the cleaner,
not-over-engineered choice here — it is a normal join, not extra abstraction.

**Why `service_name`, `price`, `commission` are duplicated from `services` here (snapshot,
not pure FK):** the existing `BookingService` interface already stores price/commission at
booking time, independent of the current `services` table values (prices change over time,
but historical bookings must keep the price charged on that day). This is intentional
historical-accuracy denormalization already present in the frontend design, not a schema
smell — carried through as-is to avoid changing frontend types.

### 2.6 `course_templates`

Maps to: `CourseTemplate` interface.

| Column          | Type            | Constraints                                                                                                                                                                          |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | `TEXT`          | PK — keeps existing ids like `ct_1`                                                                                                                                                  |
| `category`      | `TEXT`          | NOT NULL — maps to `CourseTemplate.category` (kept as free text, not FK — see Open Question 3; course categories like `"คอร์สสปาตัว"` don't cleanly map 1:1 to `service_categories`) |
| `name`          | `TEXT`          | NOT NULL — maps to `CourseTemplate.name`                                                                                                                                             |
| `default_price` | `NUMERIC(10,2)` | NOT NULL, CHECK (`default_price >= 0`) — maps to `CourseTemplate.defaultPrice`                                                                                                       |
| `description`   | `TEXT`          | NOT NULL DEFAULT `''` — maps to `CourseTemplate.description`                                                                                                                         |
| `created_at`    | `TIMESTAMPTZ`   | NOT NULL DEFAULT `now()`                                                                                                                                                             |

### 2.7 `course_sales`

Maps to: `CourseSale` interface.

| Column               | Type            | Constraints                                                                                                                                 |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `TEXT`          | PK — keeps existing ids like `crs_1`                                                                                                        |
| `date`               | `DATE`          | NOT NULL — maps to `CourseSale.date`                                                                                                        |
| `therapist_id`       | `TEXT`          | FK → `therapists(id)`, NOT NULL — replaces free-text `therapistName` (same rationale as `bookings.therapist_id`)                            |
| `course_category`    | `TEXT`          | NOT NULL — maps to `CourseSale.courseCategory` (free text, not FK — mirrors `course_templates.category`, same ambiguity as Open Question 3) |
| `course_type`        | `TEXT`          | NOT NULL — maps to `CourseSale.courseType`                                                                                                  |
| `price`              | `NUMERIC(10,2)` | NOT NULL, CHECK (`price >= 0`) — maps to `CourseSale.price`                                                                                 |
| `commission_percent` | `NUMERIC(5,2)`  | NOT NULL, CHECK (`commission_percent >= 0`) — maps to `CourseSale.commissionPercent`                                                        |
| `commission_amount`  | `NUMERIC(10,2)` | NOT NULL, CHECK (`commission_amount >= 0`) — maps to `CourseSale.commissionAmount`                                                          |
| `update_date`        | `TIMESTAMPTZ`   | NOT NULL DEFAULT `now()` — maps to `CourseSale.updateDate`                                                                                  |
| `update_by`          | `TEXT`          | NOT NULL — maps to `CourseSale.updateBy`                                                                                                    |

Not linked to `course_templates` via FK because the mock data shows `courseType` values
(e.g., `"ขัดผิวถั่วเหลือง 5 ครั้ง"`) that don't always match a `course_templates.name`
exactly — templates are used for auto-fill convenience at entry time, not as a strict
foreign key afterward. See Open Question 3.

### 2.8 `system_users`

Maps to: `SystemUser` interface.

| Column         | Type                                                                 | Constraints                                                                                                            |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `username`     | `TEXT`                                                               | PK — maps to `SystemUser.username`                                                                                     |
| `password`     | `VARCHAR(255)`                                                       | NOT NULL — maps to `SystemUser.password` (stores plaintext in local storage mock; will store hash in production)       |
| `role`         | `system_user_role` (ENUM: `'admin'`, `'manager'`, `'super-manager'`) | NOT NULL — maps to `SystemUser.role`                                                                                   |
| `display_name` | `TEXT`                                                               | NOT NULL — maps to `SystemUser.displayName` (display name for the account, e.g. "Admin User", "Manager User", "Super Manager") |
| `full_name`    | `TEXT`                                                               | NOT NULL — maps to `SystemUser.fullName` (first and last name of system user)                                          |
| `created_at`   | `TIMESTAMPTZ`                                                        | NOT NULL DEFAULT `now()`                                                                                               |

### 2.9 `app_settings`

Not derived from a TS interface directly — backs the single `LATE_SHIFT_RATE` value
currently stored as a bare number in `localStorage` (`KEYS.LATE_SHIFT_RATE` in `db.ts`).

| Column       | Type          | Constraints                                                                                                                 |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `key`        | `TEXT`        | PK — e.g. `'late_shift_rate'`                                                                                               |
| `value`      | `TEXT`        | NOT NULL — stored as text and parsed/typed by the API layer per key, since this table may hold more than one future setting |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()`                                                                                                    |

**Why a generic key/value table instead of a dedicated `late_shift_rate NUMERIC` column
somewhere:** today there is exactly one setting, but `db.ts` already names the constant
`LATE_SHIFT_RATE` inside a `KEYS` map alongside other config-like entries, suggesting more
settings will likely follow. A key/value table avoids a schema migration every time a new
single-value setting is added, which is a reasonable, low-overhead abstraction (per
"Cost-Effective Abstraction" — this one avoids repeated migrations, a concrete DRY/future-
flexibility win, not speculative over-engineering). If this table ever needs strict typed
settings later, that's a straightforward follow-up migration.

---

## 3. Relationships (Foreign Keys)

```
service_categories (id) ──< services (category_id)                [1-to-many, nullable FK]

services (id) ──< booking_services (service_id)                    [1-to-many]
bookings (id) ──< booking_services (booking_id)  ON DELETE CASCADE [1-to-many]

therapists (id) ──< bookings (therapist_id)                        [1-to-many]
therapists (id) ──< course_sales (therapist_id)                    [1-to-many]
therapists (id) ──< system_users (therapist_id, nullable)          [1-to-many, optional]
therapists (id) ──< advance_deduction_ledger (therapist_id)        [1-to-many]

course_templates                                                    [standalone master data,
                                                                       no enforced FK to course_sales
                                                                       — see Open Question 3]

app_settings                                                         [standalone key/value store,
                                                                       no FK to any other table]
```

In words:

- A **service category** has many **services**.
- A **service** can appear on many **booking_services** lines (across many bookings).
- A **booking** has many **booking_services** lines (this is the normalized form of
  `Booking.services[]`); deleting a booking cascades to delete its service lines.
- A **therapist** has many **bookings** and many **course_sales** — replacing the current
  by-name string references (`therapistName`) with a proper FK (`therapist_id`).
- A **therapist** may optionally be linked from one or more **system_users** accounts.
- **course_templates** and **app_settings** are standalone reference/config tables with no
  inbound or outbound FKs in this design.

---

## 4. Open Questions for Frontend/Product

> **Status update (2026-07-06):** Product Owner decided to defer the auth/login system (Question 4) until after the core feature modules are built — do not block schema implementation on it. Question 2 is resolved per Backend team's judgement below since decision authority for Backend was delegated. Questions 1, 3, 5, 6, 7 remain open and will be revisited when the relevant module is implemented.

1. **`Service.category` is a free-text string, often empty (`""`), not a strict reference.**
   Roughly half the seed services (`srv_6` through `srv_30`) have `category: ""`. Should the
   real schema enforce `services.category_id` as NOT NULL going forward (forcing every
   service into a category), or keep it nullable indefinitely? If NOT NULL is wanted, we'll
   need a data-cleanup/backfill step before migrating.

2. **`therapistName` / `linkedTherapistName` are matched by name, not by id, in the current
   mock data.** `Booking`, `CourseSale`, and `SystemUser` all reference therapists by their
   display name string. This design promotes those to FK `therapist_id` columns (safer,
   avoids broken references if a name is edited/typo'd), but it means:
   - Therapist names must be enforced UNIQUE (already reflected in the `therapists` table
     above) — is it acceptable that two therapists can never share a display name?
   - If a therapist's name changes, existing bookings would still correctly point to the
     same person (a real improvement over today's string-copy behavior) — confirm this is
     the desired behavior versus preserving the name-at-time-of-booking as a snapshot
     (similar to how `BookingService.serviceName`/`price` snapshot service data).

   **Resolved (2026-07-06, Backend team decision):** Keep the FK-by-id design as drafted
   above (no name snapshot). Renaming a therapist should update everywhere they're
   referenced — this matches how a "therapist" is a real, continuous entity (unlike a
   service price, which genuinely changes over time and must stay historically accurate).
   UNIQUE on `therapists.name` stands; two therapists sharing a display name is not
   supported in this phase.

3. **`CourseTemplate.category`/`name` vs `CourseSale.courseCategory`/`courseType` are not
   guaranteed to match.** Templates exist to auto-fill price on entry, but sale records
   store their own free-text category/type strings that may drift from the template later
   (or not correspond to any template at all, e.g. custom one-off courses). Should
   `course_sales` eventually get an optional FK to `course_templates` for reporting
   purposes, or is the current "decoupled free text" behavior intentional and to be
   preserved?

4. **`SystemUser` has no password, email, or any auth credential field today.** The mock
   data only has `username`, `role`, `linkedTherapistName`. Before real implementation, we
   need to know: will auth be handled by an external provider (e.g., Supabase Auth,
   NextAuth with OAuth), in which case `system_users` mostly just needs to store role/
   metadata keyed by an external auth `user_id`? Or is a self-managed username+password
   flow expected, in which case a `password_hash` column (never plaintext) must be added on
   top of this design?

   **Resolved (2026-07-06):** Auth/login mechanism added to system. `system_users` now contains a `password` column (plain text mock in local storage; hash in production) and `display_name` column to replace therapist linking.

5. **Audit fields (`updateDate`/`updateBy`) — trigger vs. application-level?** Currently
   `db.ts` sets these fields manually in `saveBooking`/`saveCourseSale` before writing.
   Should the real backend keep that application-level responsibility (API route sets
   `update_date = now()`, `update_by = <authenticated user>` on every write), or should this
   move to a PostgreSQL trigger (`BEFORE UPDATE` auto-setting `update_date`)? A trigger
   guarantees consistency even for out-of-band writes, but `update_by` still requires the
   acting user's identity to be passed in somehow (e.g., via `SET LOCAL app.current_user`),
   which adds complexity. Recommend deciding this before the implementation phase.

6. **`Booking.timeSlot` and `CourseSale`/`Booking` `id` formats are ad hoc strings**
   (e.g. `"bkg_2026-05-26_0_4"`, `"9.50-10.50"`). This design keeps them as opaque `TEXT`
   to avoid forcing a parsing/validation change on the frontend, but confirm no downstream
   logic depends on parsing structure out of these strings that a real ID generation
   strategy (e.g. UUID or serial) might break.

7. **`booking_services.quantity` allows fractional values** (`0.5`, `1.5`, `2.0` seen in
   mock data) — confirming this represents session-duration multiples (e.g., 1.5x a
   standard session length) rather than a literal item count, since "quantity" normally
   implies whole units. If duration-based, the meaning is captured correctly by the
   `BookingService.quantity` field already; this is included only to check whether a
   duration/minutes field would eventually be more explicit design-wise, since "quantity"
   is a slightly ambiguous name for it.

---

## 5. Implementation Status

No code, ORM schema, or migration files were created in this phase — implementation
follows in a separate atomic task after this design is reviewed.
