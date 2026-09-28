#!/usr/bin/env bash
# Carga en los ambientes production de GitHub las variables y secretos del despliegue (spec 0006).
# Se corre en Azure Cloud Shell después de provision.sh, con `gh` ya autenticado (gh auth login).
#
#   SUFFIX=hj01 bash github-env.sh
#
# Lee de Azure todo lo que puede: las URLs, la identidad, las cadenas de Supabase y los tokens
# de Static Web Apps pasan directo a GitHub sin mostrarse. Solo pide la cuenta admin de la semilla.
# Se puede volver a correr: cada valor se sobrescribe con el actual.
set -euo pipefail

SUFFIX="${SUFFIX:?Define SUFFIX: el mismo que usaste en provision.sh}"
OWNER="${OWNER:-hjmnz-dev}"

RG="rg-cafeta"
APP="cafeta-api-${SUFFIX}"
IDENTITY="id-cafeta-deploy"
SWA_WEB="swa-cafeta-web"
SWA_ADMIN="swa-cafeta-admin"
API_REPO="$OWNER/cafeta-api"
WEB_REPO="$OWNER/cafeta-app"
ADMIN_REPO="$OWNER/cafeta-admin-web"

step() { printf '\n==> %s\n' "$1"; }
fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

gh auth status >/dev/null 2>&1 || fail "gh no tiene sesión. Corre primero: gh auth login"
az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null ||
  fail "No existe la Web App $APP en $RG. ¿Es el mismo SUFFIX de provision.sh?"

set_var() { gh variable set "$2" --repo "$1" --env production --body "$3"; }
# El valor entra por stdin: nunca queda en la línea de comandos ni en pantalla.
set_secret() { gh secret set "$2" --repo "$1" --env production; }
app_setting() {
  az webapp config appsettings list -g "$RG" -n "$APP" \
    --query "[?name=='$1'].value | [0]" -o tsv
}
swa_token() { az staticwebapp secrets list -g "$RG" -n "$1" --query properties.apiKey -o tsv; }

step "Leyendo valores de Azure"
API_URL="https://$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"
WEB_URL="https://$(az staticwebapp show -g "$RG" -n "$SWA_WEB" --query defaultHostname -o tsv)"
ADMIN_URL="https://$(az staticwebapp show -g "$RG" -n "$SWA_ADMIN" --query defaultHostname -o tsv)"
CLIENT_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query clientId -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
SUB_ID="$(az account show --query id -o tsv)"
[[ -n "$(app_setting DATABASE_URL)" && -n "$(app_setting DIRECT_URL)" ]] ||
  fail "La Web App no tiene DATABASE_URL o DIRECT_URL. Corre provision.sh con ROTATE_DB=1."

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

step "$API_REPO"
set_var "$API_REPO" AZURE_CLIENT_ID "$CLIENT_ID"
set_var "$API_REPO" AZURE_TENANT_ID "$TENANT_ID"
set_var "$API_REPO" AZURE_SUBSCRIPTION_ID "$SUB_ID"
set_var "$API_REPO" AZURE_WEBAPP_NAME "$APP"
set_var "$API_REPO" API_URL "$API_URL"
app_setting DIRECT_URL | set_secret "$API_REPO" DIRECT_URL
app_setting DATABASE_URL | set_secret "$API_REPO" DATABASE_URL
printf '%s' "$SEED_ADMIN_EMAIL" | set_secret "$API_REPO" SEED_ADMIN_EMAIL
printf '%s' "$SEED_ADMIN_PASSWORD" | set_secret "$API_REPO" SEED_ADMIN_PASSWORD
unset SEED_ADMIN_PASSWORD

step "$WEB_REPO"
set_var "$WEB_REPO" VITE_API_URL "$API_URL/api/v1"
set_var "$WEB_REPO" PUBLIC_URL "$WEB_URL"
swa_token "$SWA_WEB" | set_secret "$WEB_REPO" AZURE_STATIC_WEB_APPS_API_TOKEN

step "$ADMIN_REPO"
set_var "$ADMIN_REPO" PUBLIC_URL "$ADMIN_URL"
swa_token "$SWA_ADMIN" | set_secret "$ADMIN_REPO" AZURE_STATIC_WEB_APPS_API_TOKEN

step "Resumen (los secretos solo muestran su nombre)"
for repo in "$API_REPO" "$WEB_REPO" "$ADMIN_REPO"; do
  printf '\n%s\n' "$repo"
  gh variable list --repo "$repo" --env production
  gh secret list --repo "$repo" --env production
done
