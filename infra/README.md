# Runbook de producción

Cómo poner Cafeta en internet y mantenerlo ahí. La decisión completa está en el spec 0006 (`docs/specs/0006-despliegue-tres-repos/` en la carpeta del espacio de trabajo). Sigue los pasos en orden la primera vez; después, cada merge a `main` despliega solo.

| Pieza               | Dónde                                        | Costo                                 |
| ------------------- | -------------------------------------------- | ------------------------------------- |
| API                 | Azure App Service, plan Linux B1 (East US)   | Unos 13 USD al mes, del crédito       |
| Web y consola admin | Azure Static Web Apps, plan Free (East US 2) | Gratis                                |
| Base de datos       | Supabase, plan Free (East US)                | Gratis (se pausa tras 7 días sin uso) |
| Despliegue          | GitHub Actions (`ci.yml` de cada repo)       | Gratis hasta 2000 minutos al mes      |

Todo lo de Azure vive en el grupo `rg-cafeta`: si lo borras, se borra todo.

## Antes de empezar

- Una cuenta de Azure for Students activa con tu correo de INTEC.
- Una cuenta de Supabase.
- `gh` en tu PC con sesión iniciada (`gh auth status`).
- **GitHub Pro en `hjmnz-dev`**. Los tres repos son privados, y GitHub solo da ambientes (`environment: production`) en repos privados con Pro. Con el [Student Developer Pack](https://education.github.com/pack) Pro es gratis. Revisa tu plan en GitHub, Settings, Billing and plans. Sin Pro, los jobs `deploy` no pueden leer sus secretos: no sigas y decídelo con `/architect despliegue` (hacer públicos los repos, o mover los secretos al nivel del repo).

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
2. Sube `infra/provision.sh` con el botón **Manage files, Upload**.
3. Elige un sufijo de 4 letras minúsculas o números (por ejemplo tus iniciales y dos dígitos; el nombre `*.azurewebsites.net` es global) y corre:

   ```bash
   SUFFIX=hj01 ALERT_EMAIL=tu@correo.com bash provision.sh
   ```

4. Cuando lo pida, pega `DATABASE_URL` y `DIRECT_URL`. No se ven al escribir ni quedan en el historial.
5. Al final imprime los valores para GitHub. Déjalos en pantalla para el paso 3.

El script crea el plan B1, la Web App de la API con Node 24, Always On, WebSockets, health check en `/api/v1/health`, solo HTTPS, TLS 1.2 y sin FTP ni autenticación básica; las dos Static Web Apps; la identidad `id-cafeta-deploy` con su credencial federada para GitHub (solo el ambiente `production` de `hjmnz-dev/cafeta-api`) y el rol `Website Contributor` solo sobre la API; y el presupuesto de 15 USD. También genera un `JWT_SECRET` nuevo sin mostrarlo.

Lo puedes volver a correr cuando quieras: lo que ya existe se deja igual. Si falla a mitad, corrige y vuelve a correrlo.

| Si ves                                       | Haz esto                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `El runtime NODE:24-lts no aparece`          | Azure no ofrece Node 24 en Linux ahora mismo. No cambies de versión por tu cuenta: llévalo a `/architect despliegue`. |
| `Website with given name ... already exists` | El nombre está tomado en todo Azure. Corre de nuevo con otro `SUFFIX`.                                                |
| `MissingSubscriptionRegistration`            | `az provider register --namespace <el que nombre el error> --wait` y vuelve a correr el script.                       |
| `Aviso: no se pudo crear el presupuesto`     | Tu suscripción no permite presupuestos. Sigue igual y revisa el saldo como dice la sección [Costo](#costo).           |

## 3. GitHub

Recomendado desde tu PC con `gh`. Cada repo necesita un ambiente `production` que **solo acepte la rama `main`**: la credencial federada de Azure confía en cualquier job de ese ambiente, así que esta regla es lo que impide que otra rama despliegue.

```bash
for repo in cafeta-api cafeta-app cafeta-admin-web; do
  gh api -X PUT "repos/hjmnz-dev/$repo/environments/production" \
    -F "deployment_branch_policy[protected_branches]=false" \
    -F "deployment_branch_policy[custom_branch_policies]=true"
  gh api -X POST "repos/hjmnz-dev/$repo/environments/production/deployment-branch-policies" \
    -f name=main -f type=branch
done
```

Después carga las variables y los secretos. **El camino rápido** es `infra/github-env.sh` en Cloud Shell: lee de Azure las URLs, la identidad, las cadenas de Supabase y los tokens de Static Web Apps, los pasa a GitHub sin mostrarlos, y solo te pide la cuenta admin de la semilla.

```bash
gh auth login
SUFFIX=hj01 bash github-env.sh
```

Si prefieres hacerlo a mano desde tu PC, estos son los comandos (los valores salen del paso 8 de `provision.sh`). `gh secret set` sin `--body` te pide el valor sin mostrarlo.

**`cafeta-api`**

```bash
R="--repo hjmnz-dev/cafeta-api --env production"
gh variable set AZURE_CLIENT_ID $R --body "<valor>"
gh variable set AZURE_TENANT_ID $R --body "<valor>"
gh variable set AZURE_SUBSCRIPTION_ID $R --body "<valor>"
gh variable set AZURE_WEBAPP_NAME $R --body "cafeta-api-<sufijo>"
gh variable set API_URL $R --body "https://<api>.azurewebsites.net"
gh secret set DIRECT_URL $R
gh secret set DATABASE_URL $R
gh secret set SEED_ADMIN_EMAIL $R
gh secret set SEED_ADMIN_PASSWORD $R
```

`SEED_ADMIN_PASSWORD` tiene 12 caracteres o más, única, solo para producción.

**`cafeta-app`** (la web). El token lo copias en Cloud Shell con `az staticwebapp secrets list -n swa-cafeta-web --query properties.apiKey -o tsv` y lo pegas cuando `gh` lo pida:

```bash
R="--repo hjmnz-dev/cafeta-app --env production"
gh variable set VITE_API_URL $R --body "https://<api>.azurewebsites.net/api/v1"
gh variable set PUBLIC_URL $R --body "https://<web>.azurestaticapps.net"
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN $R
```

**`cafeta-admin-web`** (la consola admin). Token con `az staticwebapp secrets list -n swa-cafeta-admin --query properties.apiKey -o tsv`:

```bash
R="--repo hjmnz-dev/cafeta-admin-web --env production"
gh variable set PUBLIC_URL $R --body "https://<admin>.azurestaticapps.net"
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN $R
```

## 4. Primer despliegue y semilla

1. Fusiona a `main` primero la API. En **Actions** verás el job `deploy`: migra Supabase, sube el código y espera a que `/api/v1/health` responda 200 (hasta 5 minutos).
2. Corre la semilla una vez: **Actions, Semilla de producción, Run workflow**, o `gh workflow run seed.yml --repo hjmnz-dev/cafeta-api`. Carga las carreras y la cuenta admin, sin datos de demo. Correrla otra vez no duplica nada.
3. Comprueba:

   ```bash
   curl https://<api>.azurewebsites.net/api/v1/health     # {"status":"ok","db":"up"}
   curl -I http://<api>.azurewebsites.net/api/v1/health   # 301 hacia https
   ```

   Abre `https://<api>.azurewebsites.net/api/docs` y prueba `POST /api/v1/auth/login` con la cuenta admin.

4. Fusiona la web y después el admin. Cada uno sube su `dist/` y comprueba que su URL pública responde 200.

Si el primer `deploy` de la API falla en `azure/webapps-deploy` por autenticación, el plan B es cambiar ese paso por `az webapp deploy --resource-group rg-cafeta --name ${{ vars.AZURE_WEBAPP_NAME }} --src-path api.zip --type zip`, con el mismo `azure/login` antes.

## Cómo funciona el día a día

- Un push a `main` corre CI y, solo si todo pasa, `deploy`. Los PR y las otras ramas nunca despliegan.
- En `main` un push nuevo no corta un despliegue en curso: espera y corre después. Si llegan tres pushes seguidos, GitHub descarta el del medio que seguía en espera y despliega el último, que ya lo incluye.
- **Cuando un cambio toca el contrato, fusiona y despliega primero la API y después la web.** La web nunca debe llamar a un endpoint que producción no tiene.
- En la API la migración va siempre antes que el código. Si falla, el job se pone en rojo, no se sube nada y la versión anterior sigue en pie.
- Cada push a `main` en la API gasta unos 8 minutos de Actions. Agrupa cambios cuando puedas.

## Volver atrás

- **Código**: `git revert <commit>` en `main` y push. El mismo pipeline despliega la versión anterior.
- **Base**: una migración aplicada no se revierte con `git revert`. Se corrige con una migración nueva.

## Rotar secretos

| Qué                      | Cómo                                                                                                        | Efecto                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `JWT_SECRET`             | `SUFFIX=<el mismo> ALERT_EMAIL=<el mismo> ROTATE_JWT=1 bash provision.sh`                                   | Cierra todas las sesiones       |
| Contraseña de Supabase   | Cámbiala en Supabase, corre el script con `ROTATE_DB=1` y actualiza `DIRECT_URL` y `DATABASE_URL` en GitHub | La API se reinicia con la nueva |
| Token de Static Web Apps | `az staticwebapp secrets reset-api-key -n <swa>` y vuelve a cargarlo en GitHub                              | El token viejo deja de servir   |

## Revisar en el portal

Una vez, después del primer despliegue, en la Web App de la API:

- **Configuration, General settings**: Stack Node 24 LTS, Startup command `node dist/main.js`, Always On, Web sockets y HTTP 2.0 encendidos, FTP state `Disabled`, Minimum TLS 1.2, SCM y FTP Basic Auth apagados, HTTPS Only encendido.
- **Health check**: activo en `/api/v1/health`.
- **Environment variables**: están `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `WEB_ORIGIN` y `ADMIN_ORIGIN` (los orígenes sin barra al final).

## Costo

- El único recurso con costo es el plan B1. El presupuesto `budget-cafeta` avisa a tu correo al 80 % y al 100 % de 15 USD al mes.
- Si el script no pudo crear el presupuesto, revisa el saldo del crédito una vez por semana en [microsoftazuresponsor.com/balance](https://www.microsoftazuresponsor.com/balance) o en el portal, **Cost Management**. Si el crédito se acaba, Azure deshabilita la suscripción y la API se cae.

## Cuidados

- **Supabase se pausa** tras 7 días sin consultas. El health check de App Service la consulta cada minuto, así que solo pasa si la API se detiene más de una semana. Si ocurre, reactívala a mano en el panel de Supabase.
- Always On llama a `/` cada pocos minutos y la API responde 404 ahí. Es normal.
- Cada despliegue de la API reinicia la app y deja unos segundos sin servicio (el plan B1 no tiene slots).
- Para ver los logs en vivo: `az webapp log tail -g rg-cafeta -n cafeta-api-<sufijo>`.
- Para borrarlo todo al final del curso: `az group delete -n rg-cafeta`. Pausa o borra también el proyecto de Supabase.
