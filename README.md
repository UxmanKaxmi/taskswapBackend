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
│     ├─ seededPush/
│     ├─ seededUser/
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

Optional seeded launch push activity:

- `SEEDED_PUSHES_ENABLED` Defaults to `false`. Set to `true` to create seeded pushes for eligible motivation tasks.
- `SEEDED_PUSH_MIN` Defaults to `1`. Minimum seeded pushes to create per eligible task.
- `SEEDED_PUSH_MAX` Defaults to `3`. Maximum seeded pushes to create per eligible task. The current scheduler supports up to 10 per task.
- `SEEDED_PEOPLE_API_URL` Optional mock people API used by `seed:users` for full names and profile images. Defaults to Random User portraits.

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
- `yarn seed:users` / `npm run seed:users` / `bun run seed:users`

## Seeded Users and Seeded Pushes

The backend supports seeded launch users that can appear as normal public users and push authors. This is used to create believable motivation activity after a real user creates a motivation task.

### Product Rules

- Seeded users use `origin = "seeded"` internally.
- Real users use `origin = "real"` by default.
- Seeded users are never labeled as seeded in frontend API responses.
- Seeded users cannot authenticate or log in.
- Seeded users never receive notifications or FCM pushes.
- Seeded users can be used as push authors.
- Public profile APIs never expose email, origin, auth provider fields, or private account fields.
- Own profile APIs may expose private/account fields such as email.

### Schema Fields

`User` includes:

- `origin`: internal user origin. Expected values are `real` and `seeded`.
- `username`: public handle.
- `avatarInitial`: fallback avatar initial.
- `avatarColor`: fallback avatar color.

`Push` includes:

- `source`: internal push source. Expected values are `real` and `seeded`.
- `message`: optional seeded push copy shown with push history when available.

These internal fields should not be exposed directly by public API serializers.

### Seeding Users

Run:

```
npm run seed:users
```

This creates 30 seeded users with stable IDs, usernames, internal non-deliverable emails, full display names, profile images when available, avatar initials/colors, and a small deterministic follow graph. The script is idempotent and can be run multiple times without duplicating users.

By default, `seed:users` pulls full names and profile images from:

```
https://randomuser.me/api/?results=30&seed=taskswap-launch-real-portraits
```

To use a different mock people API, set:

```
SEEDED_PEOPLE_API_URL="https://your-mock-api.example/people"
```

Supported response shapes include an array directly or an object with `results`, `people`, `data`, or `users`. The seeder understands common fields such as `name.first`, `name.last`, `fullName`, `picture.large`, `avatarUrl`, `avatar`, `image`, and `photo`. If the API is unavailable, the seeder falls back to bundled full-name profiles without images.

Seeded user photos are intentionally mixed: some seeded users keep the people API portrait, and some have `photo = null` so the frontend can render initials/colors. The split is deterministic per seeded profile, so reseeding does not reshuffle avatars every run.
If the people API returns the same portrait URL for more than one seeded user, only the first user keeps that image. Later duplicates are stored with `photo = null` so two seeded profiles do not show the same face.

The normal seed script also runs seeded user setup:

```
npm run seed
```

To verify seeded users in the connected database:

```
node -e 'require("dotenv").config(); const { PrismaClient } = require("@prisma/client"); const prisma = new PrismaClient(); prisma.user.count({ where: { origin: "seeded" } }).then(console.log).finally(() => prisma.$disconnect());'
```

Expected count after seeding is `30`.

### Seeded Push Generation

Seeded pushes are created from `src/features/seededPush/seededPush.service.ts` and are triggered by motivation task creation in `src/features/task/task.service.ts`.

Set:

```
SEEDED_PUSHES_ENABLED="true"
SEEDED_PUSH_MIN="1"
SEEDED_PUSH_MAX="3"
```

When enabled, creating an eligible task schedules a random number of seeded pushes between the configured min and max. The scheduler caps the configured max at 10 so a bad environment value cannot generate unlimited seeded pushes for one task.

A task is eligible only when:

- the task type is `motivation`
- the task owner is a real user
- the task is public
- the task is not completed
- the task is not expired
- the task does not already have enough pushes
- the same seeded user has not already pushed the task

Seeded pushes use the same `Push` table as real pushes and set `source = "seeded"` internally. When each delayed push is created, it triggers the same task-owner motivation notification path as a real push. Seeded users themselves remain excluded from all notification recipient paths.

The current implementation schedules delayed pushes in process with `setTimeout`:

- first push after 1-3 minutes
- second push after 10-25 minutes
- third push after 45-90 minutes
- fourth push after 2-4 hours
- fifth push after 5-8 hours
- sixth push after 9-14 hours
- seventh push after 15-22 hours
- eighth push after 24-34 hours
- ninth push after 36-48 hours
- tenth push after 54-72 hours

The more seeded pushes are configured, the farther apart the later pushes become. For example, `SEEDED_PUSH_MAX="10"` may spread activity across roughly three days instead of clustering all seeded pushes in the first hour.

Before each delayed push is written, the backend re-checks that the task still exists, is still public, is still a motivation task, is owned by a real user, is not completed, is not expired, and has not already reached the configured seeded push cap. This in-process scheduler is intentionally isolated in `seededPush.service.ts` so it can be upgraded later to a durable job queue.

### Public API Serialization

Public user serializers return safe public fields only:

- `id`
- `displayName`
- `username`
- `handle`
- `avatar`
- `avatarUrl`
- `avatarInitial`
- `avatarColor`
- compatibility fields `name` and `photo`

Public profile responses also include counts and public stats:

- `followersCount`
- `followingCount`
- `isFollowing`
- `pushesSentCount`
- `peoplePushedCount`
- `peopleHelpedCount`
- `tasksCompletedCount`
- `recentTasks`
- `recentActivity`

Public profile responses never include `email`, `origin`, push `source`, auth provider fields, FCM token, or private settings.

Own profile (`/users/me`) can include account fields such as `email`.

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
- `seed:users` Create/update seeded launch user profiles
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
