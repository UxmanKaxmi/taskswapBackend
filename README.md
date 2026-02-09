# Push Me Up Backend (TaskSwap)

Backend API for the Push Me Up (formerly TaskSwap) app. Built with Express + TypeScript, Prisma, and PostgreSQL, with Firebase Cloud Messaging for push notifications.

## Overview

- REST API for tasks, users, feeds, comments, votes, referrals, notifications, reminder notes, and motivation pushes.
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
│     ├─ feed/
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
- Yarn (recommended) or npm
- Firebase Admin service account JSON for push notifications

## Environment Variables

The app loads `.env` in development and `.env.production` in production via `src/db/client.ts`.

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

- `yarn db-migrate`
- `yarn db-reset`
- `yarn seed`

## Running Locally

1. Install dependencies

```
yarn install
```

2. Configure env

- Create `.env` with required variables.

3. Run migrations

```
yarn db-migrate
```

4. Start the dev server

```
yarn dev
```

Server runs on `http://localhost:3001` with a health check at `/health`.

## Scripts

- `yarn dev` Start the dev server with ts-node-dev
- `yarn build` Generate Prisma client and compile TypeScript
- `yarn start` Run the compiled server from `dist/`
- `yarn test` Reset test DB and run Jest
- `yarn test-reset` Full reset and test run
- `yarn db-migrate` Prisma migrate dev + generate
- `yarn db-reset` Prisma migrate reset
- `yarn seed` Run DB seed
- `yarn create-feature` Scaffolds a new feature

## API Routes (Top-Level)

Mounted in `src/index.ts`:

- `/feed`
- `/tasks`
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
