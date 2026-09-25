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
npm run lint
npm run format
npm test                 # unitarias
npm run test:e2e         # e2e, necesita la base arriba
npm run prisma:migrate   # nueva migración en desarrollo
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

## Conventions

- Cada dominio vive en `src/modules/<dominio>/` con `<dominio>.module.ts`, `.controller.ts`, `.service.ts`, `dto/` y `.gateway.ts` solo si usa tiempo real.
- El controller solo recibe el DTO, llama al service y devuelve; nunca toca Prisma ni tiene reglas. El service no conoce `Request` ni `Response`.
- Un service usa el service de otro dominio importando su módulo; nunca lee directo las tablas de otro dominio.
- Toda entrada pasa por un DTO validado (`whitelist`, `forbidNonWhitelisted`); nunca se pasa el `body` crudo a Prisma.
- Todo error sale por el filtro global con un `code` estable en MAYÚSCULAS (por ejemplo `EMAIL_NOT_INSTITUTIONAL`).
- Listas paginadas por cursor: `?cursor=<id>&limit=<n>` (20 por defecto, 50 máximo), respuesta `{ items, nextCursor }`.
- Toda ruta exige JWT salvo las marcadas `@Public()`.

## Gotchas

- **ESM**: todo import relativo termina en `.js` aunque el archivo sea `.ts`; no existen `__dirname` ni `require` (usa `import.meta.dirname`).
- Una clase que se inyecta por constructor se importa como valor, nunca con `import type`, o Nest pierde el tipo.
- Dos módulos que se necesitan entre sí usan `forwardRef`; un import circular sin él revienta al arrancar con `ReferenceError`.
- **Prisma fijado a la línea 7**: instala siempre con `@7` (`npm i prisma@7`); `latest` apunta a Prisma 8, que cambia esquema y API. La guía web de Prisma para NestJS ya describe Prisma 8.
- El cliente se importa desde `src/generated/prisma/client.js`; esa carpeta está fuera de git y se regenera con `prisma generate`.
- `prisma.config.ts` empieza con `import 'dotenv/config'` porque Prisma 7 no carga `.env` solo.
- En Supabase usa el pooler en modo sesión (5432), nunca el modo transacción (6543): rompe las consultas preparadas.
- Hoy las rutas fuera de `/api/v1` responden el 404 en HTML de Express, no por el filtro (hallazgo abierto en `docs/reviews/2026-09-25-cafeta-api-main.md`).

## Agent skills

- [nestjs-best-practices](../.claude/skills/nestjs-best-practices/): `kadajett/agent-nestjs-skills`, módulos, DTOs, guards, inyección y pruebas en Nest
- [prisma-client-api](../.claude/skills/prisma-client-api/): `prisma/skills`, consultas, filtros y transacciones con Prisma Client
- [prisma-cli](../.claude/skills/prisma-cli/): `prisma/skills`, `generate`, `migrate`, `db` y `studio`
- [prisma-upgrade-v7](../.claude/skills/prisma-upgrade-v7/): `prisma/skills`, cambios de Prisma 7 (generador `prisma-client`, adaptador, `prisma.config.ts`)
- [supabase](../.claude/skills/supabase/): `supabase/agent-skills`, Supabase como PostgreSQL de producción
- [supabase-postgres-best-practices](../.claude/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, esquema, índices, migraciones y conexiones en PostgreSQL

## Related specs

- 0001 Stack y arquitectura de la API (`docs/specs/0001-api-stack-architecture/index.md` en el espacio de trabajo)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
