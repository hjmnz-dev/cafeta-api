<div align="center">
  <br />
  <img src="docs/readme/banner-en.webp" alt="Cafeta API banner">
  <br />

  <div>
<img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
<img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io" />
  </div>

  <h3 align="center">Cafeta API</h3>

  <p align="center"><a href="https://cafeta-api-hj01.azurewebsites.net/api/docs">Live documentation (Swagger)</a></p>

  <p align="center">The backend of Cafeta, the social network for the INTEC university community in the Dominican Republic.</p>

  <p align="center"><b>English</b> · <a href="README.es.md">Español</a></p>
</div>

## 📋 <a name="table">Table of Contents</a>

1. ✨ [Introduction](#introduction)
2. ⚙️ [Tech Stack](#tech-stack)
3. 🔋 [Features](#features)
4. 🗂️ [Project Structure](#project-structure)
5. 🤸 [Quick Start](#quick-start)
6. 🧪 [Tests](#tests)
7. 🚀 [Deployment](#deployment)
8. 🔧 [Environment Variables](#environment)
9. 🧩 [Related Repos](#related)
10. 📬 [Contact](#contact)

## <a name="introduction">✨ Introduction</a>

Cafeta is a closed social network: only people with an INTEC institutional email can join. Students share notes and announcements, post stories, chat in real time and follow their classmates, while an admin team moderates the community from its own console.

This repository is the API behind all of that. It is a modular NestJS monolith, with one module per domain, that serves REST under `/api/v1`, publishes its OpenAPI contract and pushes messages and notifications over Socket.io.

It started as an academic project at INTEC and runs in production. Two rules shape it: traceability (every relevant action goes to an audit log) and soft deletion: almost nothing is truly deleted, it is deactivated instead.

The interface, error messages and code comments are in Spanish, the language of its users.

## <a name="tech-stack">⚙️ Tech Stack</a>

- **[NestJS 12](https://nestjs.com)** in a modular MVC layout, with strict TypeScript and ESM on **[Node.js 24](https://nodejs.org)**.
- **[Prisma 7](https://www.prisma.io)** with **[PostgreSQL 17](https://www.postgresql.org)**: Docker locally and [Supabase](https://supabase.com) in production.
- **[Socket.io](https://socket.io)** for real-time messages and notifications.
- **JWT** with sessions stored in the database, and **bcrypt** for passwords.
- **[Swagger](https://swagger.io)** through `@nestjs/swagger`: the web app and the console generate their types from this contract.
- **[Azure Blob Storage](https://azure.microsoft.com/products/storage/blobs)** for files, with [Azurite](https://github.com/Azure/Azurite) locally.
- **[Sentry](https://sentry.io)** for error monitoring and **[Nodemailer](https://nodemailer.com)** for email.
- **[Vitest](https://vitest.dev)** and **[Supertest](https://github.com/ladjs/supertest)** for tests; **oxlint** and **Prettier** for linting and formatting.

## <a name="features">🔋 Features</a>

👉 **Institutional Accounts**: Sign-up limited to allowed email domains, sign-in and sign-out, password recovery by email and self-service account deactivation.

👉 **Posts and Feed**: Create, edit, archive, restore and deactivate posts, with a cursor-paginated feed that can be filtered by degree program.

👉 **Reactions, Comments and Saves**: Five reaction types, editable comments and a personal list of saved posts.

👉 **Stories**: They last 24 hours and track views, reactions and comments.

👉 **Real-Time Messaging**: Conversations with message editing and withdrawal, plus read receipts, delivered over Socket.io.

👉 **Connections**: Follow users, follow requests for followers-only profiles, blocks and three privacy levels.

👉 **Notifications**: A list with an unread count, per-user preferences and instant alerts.

👉 **Search and Discovery**: Search people and posts, people suggestions and content exploration.

👉 **Safe Uploads**: The file type comes from the file's first bytes, never from its extension. Images, MP4, WebM and PDF are accepted with size limits, in a private container that can only be read through signed links.

👉 **Moderation**: Community reports, review and resolution by an admin, and sanctions that always require a note.

👉 **Admin Console**: Metrics dashboard, user management and verification, institutional announcements and CSV reports.

👉 **Audit Log**: Every auditable action is recorded inside the same transaction as the change.

👉 **Soft Deletion**: A database trigger blocks real deletes on protected entities, and every read filters out deactivated rows.

👉 **Secure by Default**: Every route requires a JWT unless marked `@Public()`, with strict input validation, helmet, CORS and rate limits per IP or per user.

👉 **Uniform Errors**: Every error returns `{ statusCode, message, code }`, with a stable upper-case `code` that the frontends translate for the user.

👉 **Privacy-Aware Monitoring**: Events sent to Sentry are scrubbed of personal data and capped so a loop can't burn the quota.

## <a name="project-structure">🗂️ Project Structure</a>

```text
.github/workflows/    CI, Azure deployment and production seed
docker/               Creates the test database when PostgreSQL starts
infra/                Production runbook and Azure and GitHub scripts
prisma/               Schema, migrations, seed and admin creation
scripts/              Traceability matrix between user stories and tests
src/
├── common/           Audit, soft deletion, email, monitoring, rate limits and errors
├── config/           Environment variables validated at startup
├── health/           GET /api/v1/health, with the deployed commit
├── modules/          One module per domain: auth, posts, stories, conversations…
├── prisma/           Shared Prisma client
├── app.setup.ts      Prefix, validation, helmet, CORS and Swagger
└── main.ts           Entry point
test/
├── acceptance/       Acceptance tests per user story
└── *.e2e-spec.ts     E2E tests per domain
```

## <a name="quick-start">🤸 Quick Start</a>

Follow these steps to run the API on your machine.

**Prerequisites**

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en) 24 or newer, with npm
- [Docker](https://www.docker.com/) for PostgreSQL and Azurite

**Cloning the Repository**

```bash
git clone https://github.com/hjmnz-dev/cafeta-api.git
cd cafeta-api
```

**Setting Up**

Copy the example variables, start the local databases and file storage, and install the dependencies:

```bash
cp .env.example .env
npm run db:up
npm install
```

**Creating the Tables and Demo Data**

```bash
npx prisma migrate deploy
npm run db:seed
```

The seed creates the degree programs, an admin, and demo users and posts. The admin email and the passwords come from your `.env`.

**Running the Project**

```bash
npm run start:dev
```

The API runs at [http://localhost:3000/api/v1](http://localhost:3000/api/v1/health) and its documentation at [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

## <a name="tests">🧪 Tests</a>

```bash
npm test              # unit tests, next to the code
npm run test:e2e      # e2e against the cafeta_test database; needs npm run db:up
npm run lint          # checks the whole repo and fails on any warning
npm run format:check  # checks formatting
npm run typecheck     # includes test/, which the build skips
```

Before the e2e tests, apply the migrations to the test database:

```bash
DATABASE_URL=postgresql://cafeta:cafeta@localhost:5432/cafeta_test DIRECT_URL=postgresql://cafeta:cafeta@localhost:5432/cafeta_test npx prisma migrate deploy
```

Husky and lint-staged check linting, formatting and types before every commit, and CI runs everything again on every push and pull request.

## <a name="deployment">🚀 Deployment</a>

The API runs on [Azure App Service](https://azure.microsoft.com/products/app-service) (Canada Central) with its database on Supabase. You can [check its status](https://cafeta-api-hj01.azurewebsites.net/api/v1/health) or open its [Swagger](https://cafeta-api-hj01.azurewebsites.net/api/docs).

Every push to `main` runs CI and, only if everything passes, the `deploy` job:

1. Applies the migrations with `prisma migrate deploy`. If they fail, nothing is uploaded.
2. Signs in to Azure with OIDC, with no passwords stored in GitHub, and uploads the package.
3. Waits until `/api/v1/health` reports the new commit.

Other branches and pull requests never deploy. The full step-by-step guide, from creating the resources to rotating secrets, is in the [production runbook](infra/README.md) (in Spanish).

## <a name="environment">🔧 Environment Variables</a>

They are all documented in [`.env.example`](.env.example) and validated at startup: if a required one is missing, the API won't start.

| Variable                                                                                | Purpose                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                                                            | PostgreSQL connection for the API and for migrations                                                                                                                                                                                |
| `JWT_SECRET`                                                                            | Token signing key, at least 32 characters                                                                                                                                                                                           |
| `WEB_ORIGIN`, `ADMIN_ORIGIN`                                                            | Origins allowed by CORS                                                                                                                                                                                                             |
| `ALLOWED_EMAIL_DOMAINS`                                                                 | Email domains that can sign up                                                                                                                                                                                                      |
| `AUTH_RATE_LIMIT`, `POST_RATE_LIMIT`, `COMMENT_RATE_LIMIT`, `PASSWORD_RESET_RATE_LIMIT` | Rate limits                                                                                                                                                                                                                         |
| `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`                            | File storage                                                                                                                                                                                                                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `WEB_URL`              | Recovery email. It is sent only when `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` are set; `SMTP_PORT` defaults to 587 and `WEB_URL` to `WEB_ORIGIN`. Without SMTP, the link is written to the log only outside production |
| `SENTRY_DSN`                                                                            | Error monitoring; without it, nothing is sent                                                                                                                                                                                       |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO`, `SEED_DEMO_PASSWORD`            | Only for `npm run db:seed`                                                                                                                                                                                                          |

## <a name="related">🧩 Related Repos</a>

Cafeta is made of three repositories that deploy separately:

- **[cafeta-api](https://github.com/hjmnz-dev/cafeta-api)**: this API.
- **[cafeta-app](https://github.com/hjmnz-dev/cafeta-app)**: the student web app.
- **[cafeta-admin-web](https://github.com/hjmnz-dev/cafeta-admin-web)**: the admin console.

## <a name="contact">📬 Contact</a>

**Hamsell Jiménez**

- [GitHub](https://github.com/hjmnz-dev)
- [LinkedIn](https://www.linkedin.com/in/hamselljimenez)
- [hamselljimenez@gmail.com](mailto:hamselljimenez@gmail.com)
