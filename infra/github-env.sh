#!/usr/bin/env bash
# Carga en los ambientes production de GitHub las variables y secretos del despliegue (spec 0006).
# Se corre en Azure Cloud Shell después de provision.sh, con `gh` ya autenticado (gh auth login).
#
#   SUFFIX=hj01 bash github-env.sh
#
# Lee de Azure todo lo que puede: las URLs, la identidad y las cadenas de Supabase pasan
# directo a GitHub sin mostrarse. Solo pide la cuenta admin de la semilla.
# Se puede volver a correr: cada valor se sobrescribe con el actual.
set -euo pipefail

SUFFIX="${SUFFIX:?Define SUFFIX: el mismo que usaste en provision.sh}"
OWNER="${OWNER:-hjmnz-dev}"

RG="rg-cafeta"
API="cafeta-api-${SUFFIX}"
WEB="cafeta-web-${SUFFIX}"
ADMIN="cafeta-admin-${SUFFIX}"
IDENTITY="id-cafeta-deploy"
API_REPO="$OWNER/cafeta-api"
WEB_REPO="$OWNER/cafeta-app"
ADMIN_REPO="$OWNER/cafeta-admin-web"

step() { printf '\n==> %s\n' "$1"; }
fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

gh auth status >/dev/null 2>&1 || fail "gh no tiene sesión. Corre primero: gh auth login"
for app in "$API" "$WEB" "$ADMIN"; do
  az webapp show -g "$RG" -n "$app" -o none 2>/dev/null ||
    fail "No existe la Web App $app en $RG. ¿Es el mismo SUFFIX de provision.sh?"
done

set_var() { gh variable set "$2" --repo "$1" --env production --body "$3"; }
# El valor entra por stdin: nunca queda en la línea de comandos ni en pantalla.
set_secret() { gh secret set "$2" --repo "$1" --env production; }
url_of() { printf 'https://%s' "$(az webapp show -g "$RG" -n "$1" --query defaultHostName -o tsv)"; }
app_setting() {
  az webapp config appsettings list -g "$RG" -n "$API" \
    --query "[?name=='$1'].value | [0]" -o tsv
}

step "Leyendo valores de Azure"
API_URL="$(url_of "$API")"
WEB_URL="$(url_of "$WEB")"
ADMIN_URL="$(url_of "$ADMIN")"
CLIENT_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query clientId -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
SUB_ID="$(az account show --query id -o tsv)"
[[ -n "$(app_setting DATABASE_URL)" && -n "$(app_setting DIRECT_URL)" ]] ||
  fail "La Web App $API no tiene DATABASE_URL o DIRECT_URL. Corre provision.sh con ROTATE_DB=1."

step "Cuenta admin de producción (la carga la semilla)"
read -rp "SEED_ADMIN_EMAIL: " SEED_ADMIN_EMAIL
[[ "$SEED_ADMIN_EMAIL" == *@*.* ]] || fail "SEED_ADMIN_EMAIL no parece un correo."
read -rsp "SEED_ADMIN_PASSWORD (12 caracteres o más, no se ve al escribir): " SEED_ADMIN_PASSWORD
echo
read -rsp "Repite la contraseña: " CONFIRM
echo
[[ ${#SEED_ADMIN_PASSWORD} -ge 12 ]] || fail "La contraseña debe tener al menos 12 caracteres."
[[ "$SEED_ADMIN_PASSWORD" == "$CONFIRM" ]] || fail "Las contraseñas no coinciden."
unset CONFIRM

# Las tres entran a Azure con la misma identidad (OIDC); ninguna guarda contraseña ni token.
set_azure_login() {
  set_var "$1" AZURE_CLIENT_ID "$CLIENT_ID"
  set_var "$1" AZURE_TENANT_ID "$TENANT_ID"
  set_var "$1" AZURE_SUBSCRIPTION_ID "$SUB_ID"
}

step "$API_REPO"
set_azure_login "$API_REPO"
set_var "$API_REPO" AZURE_WEBAPP_NAME "$API"
set_var "$API_REPO" API_URL "$API_URL"
app_setting DIRECT_URL | set_secret "$API_REPO" DIRECT_URL
app_setting DATABASE_URL | set_secret "$API_REPO" DATABASE_URL
printf '%s' "$SEED_ADMIN_EMAIL" | set_secret "$API_REPO" SEED_ADMIN_EMAIL
printf '%s' "$SEED_ADMIN_PASSWORD" | set_secret "$API_REPO" SEED_ADMIN_PASSWORD
unset SEED_ADMIN_PASSWORD

step "$WEB_REPO"
set_azure_login "$WEB_REPO"
set_var "$WEB_REPO" AZURE_WEBAPP_NAME "$WEB"
set_var "$WEB_REPO" VITE_API_URL "$API_URL/api/v1"
set_var "$WEB_REPO" PUBLIC_URL "$WEB_URL"

step "$ADMIN_REPO"
set_azure_login "$ADMIN_REPO"
set_var "$ADMIN_REPO" AZURE_WEBAPP_NAME "$ADMIN"
set_var "$ADMIN_REPO" PUBLIC_URL "$ADMIN_URL"

# Restos del plan anterior con Static Web Apps: ningún token de despliegue vive en GitHub.
for repo in "$WEB_REPO" "$ADMIN_REPO"; do
  gh secret delete AZURE_STATIC_WEB_APPS_API_TOKEN --repo "$repo" --env production 2>/dev/null || true
done

step "Resumen (los secretos solo muestran su nombre)"
for repo in "$API_REPO" "$WEB_REPO" "$ADMIN_REPO"; do
  printf '\n%s\n' "$repo"
  gh variable list --repo "$repo" --env production
  gh secret list --repo "$repo" --env production
done
