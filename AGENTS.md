# cafeta-api

## Overview

API de Cafeta: un monolito modular NestJS 12 en MVC (Controller, Service, Prisma) con un módulo por dominio del backlog. Expone REST con JSON bajo `/api/v1` y publica su contrato OpenAPI para que web y admin generen sus tipos. La decisión completa está en el spec 0001 (`docs/specs/0001-api-stack-architecture/` en la carpeta del espacio de trabajo).

## Stack

- **Language / Runtime**: TypeScript strict en ESM (`"type": "module"`, `nodenext`), Node 24 LTS
- **Framework**: NestJS 12 con `@nestjs/swagger`, `@nestjs/config`, `class-validator`, `helmet`
- **Datos**: Prisma 7 con `@prisma/adapter-pg` y PostgreSQL 17 (Docker en local, Supabase en producción por el pooler en modo sesión, puerto 5432)
- **Pruebas**: Vitest (unitarias `*.spec.ts` junto al código) y Supertest (e2e `test/*.e2e-spec.ts` contra `cafeta_test`)
- **Lint y formato**: oxlint + Prettier

## Commands

```bash
cp .env.example .env     # la primera vez
npm run db:up            # PostgreSQL local (bases cafeta y cafeta_test)
npm install              # también corre prisma generate (postinstall)
npm run start:dev        # http://localhost:3000/api/v1, Swagger en /api/docs
npm run build
npm run lint             # repo completo, falla con cualquier aviso
npm run format           # o format:check para solo revisar
npm run typecheck        # incluye test/, que el build no revisa
npm test                 # unitarias
npm run test:e2e         # e2e, necesita la base arriba
npm run prisma:migrate   # nueva migración en desarrollo
npm run db:seed          # carreras y admin; con SEED_DEMO=true también la demo
```

## Key files

| File                                          | Owns                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                 | Arranque: `trust proxy`, puerto, llama a `configureApp()`                                                               |
| `src/app.setup.ts`                            | `configureApp()`: prefijo, `ValidationPipe`, helmet, CORS, Swagger, filtro de errores; lo comparten `main.ts` y las e2e |
| `src/config/env.validation.ts`                | Variables de entorno validadas al arrancar; si falta una, la API no inicia                                              |
| `src/common/filters/http-exception.filter.ts` | Forma única de error `{ statusCode, message, code }`                                                                    |
| `src/common/decorators/public.decorator.ts`   | `@Public()` para rutas sin token                                                                                        |
| `src/prisma/prisma.service.ts`                | Cliente de Prisma global, pool de 5 conexiones, sin conectar al arrancar                                                |
| `prisma/schema.prisma`, `prisma.config.ts`    | Esquema y configuración de Prisma 7                                                                                     |
| `prisma/seed.ts`                              | Semilla: carreras y admin siempre; la demo del prototipo solo con `SEED_DEMO=true`                                      |
| `src/modules/auth/jwt-auth.guard.ts`          | Guard JWT global (`APP_GUARD`): exige Bearer con su sesión vigente en `sessions` y cuenta activa, salvo en `@Public()`  |
| `src/common/actor/`                           | `@Actor()` (quién hace la petición, para auditar) y `@CurrentUser()` (el usuario que dejó el guard)                     |
| `src/common/audit/`                           | `AuditService` y el catálogo `AUDIT_ACTIONS`; `AdminReasonDto` para las sanciones de admin                              |
| `src/common/soft-delete/soft-delete.ts`       | Filtros `ACTIVE` y `ACTIVE_AUTHOR`, y `stateChangeArgs` para desactivar y reactivar sin carreras                        |
| `test/support/reset-db.ts`                    | `APP_TABLES`: las tablas que las e2e vacían con TRUNCATE antes de cada prueba                                           |

## Conventions

- Cada dominio vive en `src/modules/<dominio>/` con `<dominio>.module.ts`, `.controller.ts`, `.service.ts`, `dto/` y `.gateway.ts` solo si usa tiempo real.
- El controller solo recibe el DTO, llama al service y devuelve; nunca toca Prisma ni tiene reglas. El service no conoce `Request` ni `Response`.
- Un service usa el service de otro dominio importando su módulo; nunca lee directo las tablas de otro dominio.
- Toda entrada pasa por un DTO validado (`whitelist`, `forbidNonWhitelisted`); nunca se pasa el `body` crudo a Prisma.
- Todo error sale por el filtro global con un `code` estable en MAYÚSCULAS (por ejemplo `EMAIL_NOT_INSTITUTIONAL`).
- Listas paginadas por cursor: `?cursor=<id>&limit=<n>` (20 por defecto, 50 máximo), respuesta `{ items, nextCursor }`.
- Toda ruta exige JWT salvo las marcadas `@Public()`.
- El controller obtiene quién hace la petición con `@Actor()` y el usuario autenticado con `@CurrentUser()`, y se los pasa al service.
- Las entidades con baja lógica nunca se borran de verdad (un trigger lo impide): se desactivan, y toda lectura filtra con `ACTIVE` (más `ACTIVE_AUTHOR` si tienen autor).
- Toda acción auditable se registra con `AuditService.record(tx, …)` dentro de la misma transacción del cambio; los códigos de `AUDIT_ACTIONS` se pueden sumar, nunca renombrar.
- `passwordHash` se omite en toda consulta por defecto (`omit` global en `PrismaService`); solo `UsersService.findByEmailWithHash` lo pide.
- Una tabla nueva se suma a `APP_TABLES` en `test/support/reset-db.ts`, o las e2e se contaminan entre sí.

## Gotchas

- **ESM**: todo import relativo termina en `.js` aunque el archivo sea `.ts`; no existen `__dirname` ni `require` (usa `import.meta.dirname`).
- Una clase que se inyecta por constructor se importa como valor, nunca con `import type`, o Nest pierde el tipo.
- Dos módulos que se necesitan entre sí usan `forwardRef`; un import circular sin él revienta al arrancar con `ReferenceError`.
- **Prisma fijado a la línea 7**: instala siempre con `@7` (`npm i prisma@7`); `latest` apunta a Prisma 8, que cambia esquema y API. La guía web de Prisma para NestJS ya describe Prisma 8.
- El cliente se importa desde `src/generated/prisma/client.js`; esa carpeta está fuera de git y se regenera con `prisma generate`.
- `prisma.config.ts` empieza con `import 'dotenv/config'` porque Prisma 7 no carga `.env` solo.
- En Supabase usa el pooler en modo sesión (5432), nunca el modo transacción (6543): rompe las consultas preparadas.
- Prisma 7 ya no siembra solo tras `migrate dev`: corre `npm run db:seed` aparte.
- Las e2e corren una a la vez (`fileParallelism: false`) porque comparten `cafeta_test`.
- `.env.test` sube `AUTH_RATE_LIMIT` a 1000 para que las e2e no choquen con el límite; para probar el 429, fija la variable antes de importar `AppModule` (ver `test/auth-rate-limit.e2e-spec.ts`).
- Hoy las rutas fuera de `/api/v1` responden el 404 en HTML de Express, no por el filtro (hallazgo abierto en `docs/reviews/2026-09-25-cafeta-api-main.md`).

## Agent skills

- [nestjs-best-practices](../.claude/skills/nestjs-best-practices/): `kadajett/agent-nestjs-skills`, módulos, DTOs, guards, inyección y pruebas en Nest
- [prisma-client-api](../.claude/skills/prisma-client-api/): `prisma/skills`, consultas, filtros y transacciones con Prisma Client
- [prisma-cli](../.claude/skills/prisma-cli/): `prisma/skills`, `generate`, `migrate`, `db` y `studio`
- [prisma-upgrade-v7](../.claude/skills/prisma-upgrade-v7/): `prisma/skills`, cambios de Prisma 7 (generador `prisma-client`, adaptador, `prisma.config.ts`)
- [supabase](../.claude/skills/supabase/): `supabase/agent-skills`, Supabase como PostgreSQL de producción
- [supabase-postgres-best-practices](../.claude/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, esquema, índices, migraciones y conexiones en PostgreSQL

Declined: skills para `@nestjs/jwt`, `@nestjs/throttler` y `bcryptjs` (los cubre `nestjs-best-practices`)

## Related specs

- 0001 Stack y arquitectura de la API (`docs/specs/0001-api-stack-architecture/index.md` en el espacio de trabajo)
- 0002 Modelo de datos (`docs/specs/0002-modelo-de-datos/index.md`)
- 0003 Auditoría y baja lógica (`docs/specs/0003-auditoria-baja-logica/index.md`)
- 0004 Registro, inicio y cierre de sesión (`docs/specs/0004-registro-inicio-cierre-sesion/index.md`)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
