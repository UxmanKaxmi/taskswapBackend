# Push Me Up Backend (TaskSwap)

Backend API for the Push Me Up (formerly TaskSwap) app. Built with Express + TypeScript, Prisma, and PostgreSQL, with Firebase Cloud Messaging for push notifications.

## Overview

- REST API for tasks, users, comments, votes, referrals, notifications, reminder notes, and motivation pushes.
- Prisma schema and migrations under `prisma/`.
- Jest test suite under `__tests__/`.

## Tech Stack

- Node.js + TypeScript
- Express 5
- Prisma ORM + PostgreSQL
- Firebase Admin SDK (FCM)
- Zod for validation
- JWT for auth

## Project Structure

```
.
├─ src/
│  ├─ index.ts
│  ├─ db/
│  │  └─ client.ts
│  ├─ middleware/
│  ├─ errors/
│  ├─ utils/
│  ├─ models/
│  ├─ types/
│  └─ features/
│     ├─ task/
│     ├─ user/
│     ├─ comment/
│     ├─ vote/
│     ├─ notification/
│     ├─ reminderNote/
│     ├─ referral/
│     └─ push/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ __tests__/
├─ scripts/
├─ dist/
├─ firebase-adminsdk.json
├─ package.json
├─ tsconfig.json
└─ jest.config.ts
```

## Requirements

- Node.js 18+ recommended
- PostgreSQL
- Yarn, npm, or Bun
- Firebase Admin service account JSON for push notifications

## Environment Variables

The app loads environment files via `src/config/env.ts`:

- Development: `.env.dev` (falls back to `.env`)
- Test: `.env.test` (falls back to `.env`)
- Production: `.env.production` (falls back to `.env`)

Required:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_WEB_ORIGIN`

Optional (Firebase Dynamic Links):

- `FDL_DOMAIN_URI_PREFIX`
- `FDL_API_KEY`
- `IOS_BUNDLE_ID`
- `ANDROID_PACKAGE`
- `IOS_APP_STORE_ID`

Note: Do not commit real secrets. Use placeholder values locally.

## Firebase Admin SDK

- Development expects `firebase-adminsdk.json` at the repo root.
- Production expects the service account at `/etc/secrets/firebase-adminsdk.json`.

## Database and Prisma

- Schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- Seed: `prisma/seed.ts`

Common commands:

- `yarn db-migrate` / `npm run db-migrate` / `bun run db-migrate`
- `yarn db-reset` / `npm run db-reset` / `bun run db-reset`
- `yarn seed` / `npm run seed` / `bun run seed`

## Running Locally

1. Install dependencies

```
yarn install
# or
npm install
# or
bun install
```

2. Configure env

- Create `.env.dev` (or `.env`) with required variables.

3. Run migrations

```
yarn db-migrate
# or
npm run db-migrate
# or
bun run db-migrate
```

4. Start the dev server

```
yarn dev
# or
npm run dev
# or
bun run dev
```

Server runs on `http://localhost:3001` with a health check at `/health`.

## Scripts

- `dev` Start the dev server with ts-node-dev
- `build` Generate Prisma client and compile TypeScript
- `start` Run the compiled server from `dist/`
- `test` Reset test DB and run Jest
- `test-reset` Full reset and test run
- `db-migrate` Prisma migrate dev + generate
- `db-reset` Prisma migrate reset
- `seed` Run DB seed
- `create-feature` Scaffolds a new feature

Run scripts with `yarn <script>`, `npm run <script>`, or `bun run <script>`.

## API Routes (Top-Level)

Mounted in `src/index.ts`:

- `/tasks` (supports `limit`, `cursor`, `excludeSelf`)
- `/users`
- `/reminderNote`
- `/notification`
- `/vote`
- `/comments`
- `/referrals`

## Tests

Jest config in `jest.config.ts`. Test files live in `__tests__/`.

## Notes

- `src/utils/sendPushNotification.ts` handles FCM messaging.
- `src/utils/scheduleReminderPush.ts` schedules reminder pushes.
- Notifications are stored in `Notification` with optional `taskType` and `metadata` fields.
