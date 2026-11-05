<div align="center">
  <br />
  <img src="docs/readme/banner.webp" alt="Banner de la API de Cafeta">
  <br />

  <div>
<img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
<img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io" />
  </div>

  <h3 align="center">Cafeta API</h3>

  <p align="center"><a href="https://cafeta-api-hj01.azurewebsites.net/api/docs">Documentación en vivo (Swagger)</a></p>

  <p align="center">El backend de Cafeta, la red social de la comunidad universitaria de INTEC, en República Dominicana.</p>

  <p align="center"><a href="README.md">English</a> · <b>Español</b></p>
</div>

## 📋 <a name="table">Tabla de contenido</a>

1. ✨ [Introducción](#introduction)
2. ⚙️ [Stack](#tech-stack)
3. 🔋 [Funciones](#features)
4. 🗂️ [Estructura](#project-structure)
5. 🤸 [Inicio rápido](#quick-start)
6. 🧪 [Pruebas](#tests)
7. 🚀 [Despliegue](#deployment)
8. 🔧 [Variables de entorno](#environment)
9. 🧩 [Los otros repos](#related)
10. 📬 [Contacto](#contact)

## <a name="introduction">✨ Introducción</a>

Cafeta es una red social cerrada: solo entra quien tiene un correo institucional de INTEC. Sus estudiantes publican apuntes y avisos, suben historias, conversan en tiempo real y siguen a sus compañeros, mientras un equipo de administración modera la comunidad desde su propia consola.

Este repositorio es la API que sostiene todo eso. Es un monolito modular en NestJS, con un módulo por dominio, que expone REST bajo `/api/v1`, publica su contrato OpenAPI y empuja mensajes y notificaciones por Socket.io.

Nació como proyecto académico en INTEC y está desplegada en producción. Sus dos reglas de fondo son la trazabilidad (cada acción relevante queda en una bitácora) y la baja lógica: casi nada se borra de verdad, se desactiva.

## <a name="tech-stack">⚙️ Stack</a>

- **[NestJS 12](https://nestjs.com)** en MVC por módulos, con TypeScript strict y ESM sobre **[Node.js 24](https://nodejs.org)**.
- **[Prisma 7](https://www.prisma.io)** con **[PostgreSQL 17](https://www.postgresql.org)**: Docker en local y [Supabase](https://supabase.com) en producción.
- **[Socket.io](https://socket.io)** para mensajes y notificaciones en tiempo real.
- **JWT** con sesiones guardadas en la base, y **bcrypt** para las contraseñas.
- **[Swagger](https://swagger.io)** con `@nestjs/swagger`: de ese contrato salen los tipos de la web y de la consola.
- **[Azure Blob Storage](https://azure.microsoft.com/products/storage/blobs)** para los archivos, con [Azurite](https://github.com/Azure/Azurite) en local.
- **[Sentry](https://sentry.io)** para el monitoreo de errores y **[Nodemailer](https://nodemailer.com)** para los correos.
- **[Vitest](https://vitest.dev)** y **[Supertest](https://github.com/ladjs/supertest)** para las pruebas; **oxlint** y **Prettier** para lint y formato.

## <a name="features">🔋 Funciones</a>

👉 **Cuentas institucionales**: Registro limitado a los dominios permitidos, inicio y cierre de sesión, recuperación de contraseña por correo y desactivación de la cuenta propia.

👉 **Publicaciones y feed**: Crear, editar, archivar, restaurar y desactivar publicaciones, con un feed paginado por cursor que se puede filtrar por carrera.

👉 **Reacciones, comentarios y guardados**: Cinco tipos de reacción, comentarios editables y una lista personal de publicaciones guardadas.

👉 **Historias**: Duran 24 horas y tienen registro de vistas, reacciones y comentarios.

👉 **Mensajería en tiempo real**: Conversaciones con edición y retiro de mensajes, y marcas de lectura, entregadas por Socket.io.

👉 **Red de contactos**: Seguir usuarios, solicitudes para los perfiles de solo seguidores, bloqueos y tres niveles de privacidad.

👉 **Notificaciones**: Lista con conteo de no leídas, preferencias por usuario y avisos al instante.

👉 **Búsqueda y descubrimiento**: Búsqueda de personas y publicaciones, sugerencias de personas y exploración de contenido.

👉 **Archivos seguros**: El formato se decide por los primeros bytes del archivo, nunca por la extensión. Admite imágenes, MP4, WebM y PDF con límites de tamaño, en un contenedor privado que solo se lee con enlaces firmados.

👉 **Moderación**: Reportes de la comunidad, revisión y resolución por parte de un admin, y sanciones que siempre exigen una nota.

👉 **Consola de administración**: Dashboard de métricas, gestión y verificación de usuarios, anuncios institucionales e informes descargables en CSV.

👉 **Bitácora de auditoría**: Cada acción auditable se registra dentro de la misma transacción del cambio.

👉 **Baja lógica**: Un trigger de base de datos impide borrar de verdad las entidades protegidas, y toda lectura filtra lo desactivado.

👉 **Seguridad por defecto**: Toda ruta exige JWT salvo las marcadas `@Public()`, con validación estricta de entradas, helmet, CORS y límites de peticiones por IP o por usuario.

👉 **Errores uniformes**: Todo error responde `{ statusCode, message, code }`, con un `code` estable en mayúsculas que los frontends traducen para el usuario.

👉 **Monitoreo respetuoso**: Los eventos a Sentry se limpian de datos personales y tienen un tope para que un bucle no agote la cuota.

## <a name="project-structure">🗂️ Estructura</a>

```text
.github/workflows/    CI, despliegue a Azure y semilla de producción
docker/               Crea la base de pruebas al iniciar PostgreSQL
infra/                Runbook de producción y scripts de Azure y GitHub
prisma/               Esquema, migraciones, semilla y creación de admins
scripts/              Matriz de trazabilidad entre historias y pruebas
src/
├── common/           Auditoría, baja lógica, correo, monitoreo, límites y errores
├── config/           Variables de entorno validadas al arrancar
├── health/           GET /api/v1/health, con el commit desplegado
├── modules/          Un módulo por dominio: auth, posts, stories, conversations…
├── prisma/           Cliente de Prisma compartido
├── app.setup.ts      Prefijo, validación, helmet, CORS y Swagger
└── main.ts           Arranque
test/
├── acceptance/       Pruebas de aceptación por historia de usuario
└── *.e2e-spec.ts     Pruebas e2e por dominio
```

## <a name="quick-start">🤸 Inicio rápido</a>

Sigue estos pasos para levantar la API en tu máquina.

**Requisitos**

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en) 24 o superior, con npm
- [Docker](https://www.docker.com/) para PostgreSQL y Azurite

**Clonar el repositorio**

```bash
git clone https://github.com/hjmnz-dev/cafeta-api.git
cd cafeta-api
```

**Preparar el entorno**

Copia las variables de ejemplo, levanta las bases y los archivos locales, e instala las dependencias:

```bash
cp .env.example .env
npm run db:up
npm install
```

**Crear las tablas y los datos de demo**

```bash
npx prisma migrate deploy
npm run db:seed
```

La semilla crea las carreras, un admin y usuarios y publicaciones de demo. El correo del admin y las contraseñas son los de tu `.env`.

**Arrancar**

```bash
npm run start:dev
```

La API queda en [http://localhost:3000/api/v1](http://localhost:3000/api/v1/health) y su documentación en [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

## <a name="tests">🧪 Pruebas</a>

```bash
npm test              # unitarias, junto al código
npm run test:e2e      # e2e contra la base cafeta_test; necesita npm run db:up
npm run lint          # revisa todo el repo y falla con cualquier aviso
npm run format:check  # revisa el formato
npm run typecheck     # incluye test/, que el build no revisa
```

Antes de las e2e, aplica las migraciones a la base de pruebas:

```bash
DATABASE_URL=postgresql://cafeta:cafeta@localhost:5432/cafeta_test DIRECT_URL=postgresql://cafeta:cafeta@localhost:5432/cafeta_test npx prisma migrate deploy
```

Husky y lint-staged revisan lint, formato y tipos antes de cada commit, y el CI repite todo en cada push y en cada PR.

## <a name="deployment">🚀 Despliegue</a>

La API corre en [Azure App Service](https://azure.microsoft.com/products/app-service) (Canada Central) y su base en Supabase. Puedes [comprobar su estado](https://cafeta-api-hj01.azurewebsites.net/api/v1/health) o abrir su [Swagger](https://cafeta-api-hj01.azurewebsites.net/api/docs).

Cada push a `main` corre el CI y, solo si todo pasa, el job `deploy`:

1. Aplica las migraciones con `prisma migrate deploy`. Si fallan, no se sube nada.
2. Entra a Azure con OIDC, sin contraseñas guardadas en GitHub, y sube el paquete.
3. Espera a que `/api/v1/health` responda con el commit nuevo.

Las demás ramas y los PR nunca despliegan. El paso a paso completo, desde crear los recursos hasta rotar secretos, está en el [runbook de producción](infra/README.md).

## <a name="environment">🔧 Variables de entorno</a>

Todas están documentadas en [`.env.example`](.env.example) y se validan al arrancar: si falta una obligatoria, la API no inicia.

| Variable                                                                                | Para qué sirve                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                                                            | Conexión a PostgreSQL de la API y de las migraciones              |
| `JWT_SECRET`                                                                            | Firma de los tokens, con al menos 32 caracteres                   |
| `WEB_ORIGIN`, `ADMIN_ORIGIN`                                                            | Orígenes permitidos por CORS                                      |
| `ALLOWED_EMAIL_DOMAINS`                                                                 | Dominios de correo que se pueden registrar                        |
| `AUTH_RATE_LIMIT`, `POST_RATE_LIMIT`, `COMMENT_RATE_LIMIT`, `PASSWORD_RESET_RATE_LIMIT` | Límites de peticiones                                             |
| `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`                            | Almacenamiento de archivos                                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `WEB_URL`              | Correo de recuperación; sin ellas, el enlace se escribe en el log |
| `SENTRY_DSN`                                                                            | Monitoreo de errores; sin él, no se envía nada                    |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO`, `SEED_DEMO_PASSWORD`            | Solo para `npm run db:seed`                                       |

## <a name="related">🧩 Los otros repos</a>

Cafeta son tres repositorios que se despliegan por separado:

- **[cafeta-api](https://github.com/hjmnz-dev/cafeta-api)**: esta API.
- **[cafeta-app](https://github.com/hjmnz-dev/cafeta-app)**: la app web del estudiante.
- **[cafeta-admin-web](https://github.com/hjmnz-dev/cafeta-admin-web)**: la consola de administración.

## <a name="contact">📬 Contacto</a>

**Hamsell Jiménez**

- [GitHub](https://github.com/hjmnz-dev)
- [LinkedIn](https://www.linkedin.com/in/hamselljimenez)
- [hamselljimenez@gmail.com](mailto:hamselljimenez@gmail.com)
