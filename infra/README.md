# Runbook de producción

Cómo poner Cafeta en internet y mantenerlo ahí. La decisión completa está en el spec 0006 (`docs/specs/0006-despliegue-tres-repos/` en la carpeta del espacio de trabajo). Sigue los pasos en orden la primera vez; después, cada merge a `main` despliega solo.

| Pieza         | Dónde                                                              | Costo                                 |
| ------------- | ------------------------------------------------------------------ | ------------------------------------- |
| API           | Web App `cafeta-api-<sufijo>` en el plan Linux B1 `plan-cafeta`    | El plan: unos 13 a 15 USD al mes      |
| Web           | Web App `cafeta-web-<sufijo>` en el mismo plan, con `server.mjs`   | Sin costo extra                       |
| Consola admin | Web App `cafeta-admin-<sufijo>` en el mismo plan, con `server.mjs` | Sin costo extra                       |
| Base de datos | Supabase, plan Free (East US)                                      | Gratis (se pausa tras 7 días sin uso) |
| Despliegue    | GitHub Actions (`ci.yml` de cada repo), entra a Azure con OIDC     | Gratis hasta 2000 minutos al mes      |

Todo lo de Azure vive en el grupo `rg-cafeta`, en **Canada Central**: si borras el grupo, se borra todo. El plan B1 se paga con el crédito de Azure for Students.

## Antes de empezar

- Una cuenta de Azure for Students activa con tu correo de INTEC.
- Una cuenta de Supabase.
- `gh` con sesión iniciada (`gh auth status`).
- **GitHub Pro en `hjmnz-dev`**. Los tres repos son privados, y GitHub solo da ambientes (`environment: production`) en repos privados con Pro. Con el [Student Developer Pack](https://education.github.com/pack) Pro es gratis. Sin Pro, los jobs `deploy` no pueden usar su ambiente: no sigas y decídelo con `/architect despliegue`.

### Regiones permitidas

La suscripción Azure for Students solo deja crear recursos en `chilecentral`, `canadacentral`, `westus`, `belgiumcentral` y `mexicocentral`. Crear en otra da `RequestDisallowedByAzure`. Puedes confirmarlo en Cloud Shell:

```bash
az policy assignment list --query "[].parameters.listOfAllowedLocations.value" -o tsv
```

Por eso todo va en `canadacentral` (la más cercana a Supabase en East US), y por eso la web y el admin no usan Static Web Apps: ese servicio no existe en ninguna de esas regiones. `provision.sh` revisa la lista antes de crear nada y se detiene si la región no está permitida; nunca elige otra por su cuenta.

## 1. Supabase

1. En [supabase.com](https://supabase.com/dashboard) crea el proyecto `cafeta`, plan Free, región **East US (North Virginia)**.
2. Genera la contraseña de la base con el botón del panel. Te recomiendo que use solo letras y números (32 o más): así no hay que codificarla dentro de la URL. Guárdala en tu gestor de contraseñas, nunca en un archivo del repo.
3. Abre **Connect**, pestaña **Session pooler** (puerto 5432, nunca el 6543). Copia el host y el usuario tal como aparecen (el usuario es `postgres.<ref>`; el host puede empezar con `aws-0` o `aws-1`).
4. Arma las dos cadenas:

   ```text
   DATABASE_URL=postgresql://postgres.<ref>:<clave>@<host>:5432/postgres?sslmode=require&uselibpqcompat=true
   DIRECT_URL=postgresql://postgres.<ref>:<clave>@<host>:5432/postgres?sslmode=require
   ```

   `uselibpqcompat=true` hace que `pg` 8 cifre la conexión sin exigir la cadena del certificado de Supabase; sin él la API falla con `self-signed certificate in certificate chain`. `DIRECT_URL` no lo lleva porque la lee el motor de migraciones de Prisma, que ya entiende `require` así.

5. En **Database, Settings, Connection pooling**, confirma que el **Pool Size** sea 15 o más. La API usa hasta 5 conexiones, y la migración y la semilla salen del mismo pooler.
6. Si quieres, comprueba la conexión desde tu PC, dentro de `cafeta-api` (en PowerShell):

   ```powershell
   $env:DIRECT_URL='<tu DIRECT_URL>'; npx prisma migrate status; Remove-Item Env:DIRECT_URL
   ```

   Debe conectar y decir que hay migraciones pendientes. Es lo esperado: las aplica el primer despliegue.

## 2. Azure

1. En [portal.azure.com](https://portal.azure.com) abre **Cloud Shell** en modo **Bash**.
2. Sube `infra/provision.sh` y `infra/github-env.sh` con el botón **Manage files, Upload**. La sesión de Cloud Shell es efímera: si se reinicia, vuelve a subirlos.
3. Elige un sufijo de 4 letras minúsculas o números (por ejemplo tus iniciales y dos dígitos; los nombres `*.azurewebsites.net` son globales). Las tres Web Apps usan el mismo sufijo. Corre:

   ```bash
   SUFFIX=hj01 ALERT_EMAIL=tu@correo.com bash provision.sh
   ```

4. Cuando lo pida, pega `DATABASE_URL` y `DIRECT_URL`. No se ven al escribir ni quedan en el historial.
5. Al final imprime las URLs de la API, la web y el admin.

El script crea (o reutiliza, si ya existen) el plan B1 y las tres Web Apps con Node 24 LTS. En las tres: Always On, HTTP 2.0, solo HTTPS, TLS 1.2, sin FTP y sin autenticación básica. En la API además: WebSockets, health check en `/api/v1/health` y startup `node dist/main.js`. En la web y el admin: WebSockets apagados y startup `node server.mjs`. Pone `WEB_ORIGIN` y `ADMIN_ORIGIN` de la API con los hostnames reales de la web y del admin, genera un `JWT_SECRET` nuevo sin mostrarlo, crea la identidad `id-cafeta-deploy` con una credencial federada por repo y el rol `Website Contributor` solo sobre las tres Web Apps, y el presupuesto de 20 USD.

Lo puedes volver a correr cuando quieras: lo que ya existe no se crea de nuevo. Si falla a mitad, corrige y vuelve a correrlo.

| Si ves                                       | Haz esto                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `La suscripción no permite '<región>'`       | Usa una de las regiones que lista el mensaje con `LOCATION=<región>`. Si no es `canadacentral`, anótalo en el spec.   |
| `RequestDisallowedByAzure`                   | Lo mismo: la región no está permitida. Revisa [Regiones permitidas](#regiones-permitidas).                            |
| `El runtime NODE:24-lts no aparece`          | Azure no ofrece Node 24 en Linux ahora mismo. No cambies de versión por tu cuenta: llévalo a `/architect despliegue`. |
| `Website with given name ... already exists` | El nombre está tomado en todo Azure. Corre de nuevo con otro `SUFFIX`.                                                |
| `MissingSubscriptionRegistration`            | `az provider register --namespace <el que nombre el error> --wait` y vuelve a correr el script.                       |
| `Aviso: no se pudo crear el presupuesto`     | Tu suscripción no permite presupuestos. Sigue igual y revisa el saldo como dice la sección [Costo](#costo).           |

## 3. GitHub

Cada repo necesita un ambiente `production` que **solo acepte la rama `main`**: la credencial federada de Azure confía en cualquier job de ese ambiente, así que esta regla es lo que impide que otra rama despliegue. Ya están creados en los tres repos (2026-09-28). Si algún día hay que rehacerlos:

```bash
for repo in cafeta-api cafeta-app cafeta-admin-web; do
  gh api -X PUT "repos/hjmnz-dev/$repo/environments/production" \
    -F "deployment_branch_policy[protected_branches]=false" \
    -F "deployment_branch_policy[custom_branch_policies]=true"
  gh api -X POST "repos/hjmnz-dev/$repo/environments/production/deployment-branch-policies" \
    -f name=main -f type=branch
done
```

Después carga las variables y los secretos con `infra/github-env.sh` en Cloud Shell. Lee de Azure las URLs, la identidad y las cadenas de Supabase, las pasa a GitHub sin mostrarlas, y solo te pide la cuenta admin de la semilla:

```bash
gh auth login
SUFFIX=hj01 bash github-env.sh
```

Al final lista lo que quedó en cada ambiente:

| Repo               | Variables                                                                                              | Secretos                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `cafeta-api`       | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME`, `API_URL`          | `DIRECT_URL`, `DATABASE_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` |
| `cafeta-app`       | Las tres `AZURE_*` de login, `AZURE_WEBAPP_NAME`, `VITE_API_URL` (`API_URL` + `/api/v1`), `PUBLIC_URL` | Ninguno                                                                 |
| `cafeta-admin-web` | Las tres `AZURE_*` de login, `AZURE_WEBAPP_NAME`, `PUBLIC_URL`                                         | Ninguno                                                                 |

`SEED_ADMIN_PASSWORD` tiene 12 caracteres o más, única, solo para producción. Si prefieres cargar algo a mano desde tu PC: `gh variable set <NOMBRE> --repo hjmnz-dev/<repo> --env production --body "<valor>"`, y `gh secret set <NOMBRE> --repo hjmnz-dev/<repo> --env production` sin `--body` (te pide el valor sin mostrarlo).

## 4. Primer despliegue y semilla

1. Fusiona a `main` primero la API. En **Actions** verás el job `deploy`: migra Supabase, sube el código y espera a que `/api/v1/health` responda 200 (hasta 5 minutos).
2. Corre la semilla una vez: **Actions, Semilla de producción, Run workflow**, o `gh workflow run seed.yml --repo hjmnz-dev/cafeta-api`. Carga las carreras y la cuenta admin, sin datos de demo. Correrla otra vez no duplica nada.
3. Comprueba:

   ```bash
   curl https://<api>.azurewebsites.net/api/v1/health     # {"status":"ok","db":"up"}
   curl -I http://<api>.azurewebsites.net/api/v1/health   # 301 hacia https
   ```

   Abre `https://<api>.azurewebsites.net/api/docs` y prueba `POST /api/v1/auth/login` con la cuenta admin.

4. Fusiona la web y después el admin. Cada uno arma un `app.zip` con `server.mjs` en la raíz y su `dist/`, lo sube a su Web App y espera a que su URL pública responda 200 (hasta 5 minutos).

**Plan B** si un `deploy` falla en `azure/webapps-deploy` por autenticación: cambia ese paso por `az webapp deploy --resource-group rg-cafeta --name ${{ vars.AZURE_WEBAPP_NAME }} --src-path <api.zip o app.zip> --type zip`, con el mismo `azure/login` antes.

## Cómo funciona el día a día

- Un push a `main` corre CI y, solo si todo pasa, `deploy`. Los PR y las otras ramas nunca despliegan.
- En `main` un push nuevo no corta un despliegue en curso: espera y corre después. Si llegan tres pushes seguidos, GitHub descarta el del medio que seguía en espera y despliega el último, que ya lo incluye.
- **Cuando un cambio toca el contrato, fusiona y despliega primero la API y después la web.** La web nunca debe llamar a un endpoint que producción no tiene.
- En la API la migración va siempre antes que el código. Si falla, el job se pone en rojo, no se sube nada y la versión anterior sigue en pie.
- Cada push a `main` en la API gasta unos 8 minutos de Actions. Agrupa cambios cuando puedas.
- La web y el admin se sirven con `deploy/server.mjs` de su repo: solo `GET` y `HEAD`, nunca sale de `dist/`, recarga las rutas internas con `index.html` y responde 404 a un archivo que no existe. Si un build nuevo emite una extensión que no está en su tabla de tipos, súmala ahí.

## Volver atrás

- **Código**: `git revert <commit>` en `main` y push. El mismo pipeline despliega la versión anterior.
- **Base**: una migración aplicada no se revierte con `git revert`. Se corrige con una migración nueva.

## Rotar secretos

| Qué                    | Cómo                                                                                                                           | Efecto                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `JWT_SECRET`           | `SUFFIX=<el mismo> ALERT_EMAIL=<el mismo> ROTATE_JWT=1 bash provision.sh`                                                      | Cierra todas las sesiones       |
| Contraseña de Supabase | Cámbiala en Supabase, corre `provision.sh` con `ROTATE_DB=1` y después `github-env.sh` para copiar las cadenas nuevas a GitHub | La API se reinicia con la nueva |

GitHub no guarda ninguna contraseña de Azure: entra con OIDC, así que no hay token que rotar.

## Revisar en el portal

Una vez, después del primer despliegue:

- **Las tres Web Apps, Configuration, General settings**: Stack Node 24 LTS, Always On y HTTP 2.0 encendidos, FTP state `Disabled`, Minimum TLS 1.2, SCM y FTP Basic Auth apagados, HTTPS Only encendido.
- **API**: Startup command `node dist/main.js`, Web sockets encendido, **Health check** activo en `/api/v1/health`, y en **Environment variables** están `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `WEB_ORIGIN` y `ADMIN_ORIGIN` (los orígenes sin barra al final).
- **Web y admin**: Startup command `node server.mjs`, Web sockets apagado, sin health check.
- **`id-cafeta-deploy`**: tres credenciales federadas (`github-api`, `github-web`, `github-admin`) y el rol `Website Contributor` solo sobre las tres Web Apps.

## Costo

- El único recurso con costo es el plan B1 (unos 13 a 15 USD al mes); la web y el admin comparten ese plan sin costo extra. El presupuesto `budget-cafeta` avisa a tu correo al 80 % y al 100 % de 20 USD al mes.
- Si el script no pudo crear el presupuesto, revisa el saldo del crédito una vez por semana en [microsoftazuresponsor.com/balance](https://www.microsoftazuresponsor.com/balance) o en el portal, **Cost Management**. Si el crédito se acaba, Azure deshabilita la suscripción y se caen las tres apps a la vez.

## Cuidados

- **Supabase se pausa** tras 7 días sin consultas. El health check de App Service la consulta cada minuto, así que solo pasa si la API se detiene más de una semana. Si ocurre, reactívala a mano en el panel de Supabase.
- Always On llama a `/` cada pocos minutos. La API responde 404 ahí, y es normal; la web y el admin responden su `index.html`.
- Cada despliegue reinicia la app que se sube y deja unos segundos sin servicio (el plan B1 no tiene slots).
- Las tres apps comparten la CPU y 1.75 GB de RAM del plan B1.
- Para ver los logs en vivo: `az webapp log tail -g rg-cafeta -n <nombre de la Web App>`.
- Para borrarlo todo al final del curso: `az group delete -n rg-cafeta`. Pausa o borra también el proyecto de Supabase.
