#!/usr/bin/env bash
# Crea la infraestructura de producción de Cafeta en Azure (spec 0006).
# Se corre una vez desde Azure Cloud Shell (Bash), que ya trae `az` con tu sesión.
#
#   SUFFIX=hj01 ALERT_EMAIL=tu@correo.com bash provision.sh
#
# Se puede volver a correr: lo que ya existe no se toca. Para rotar secretos:
#   ROTATE_JWT=1  genera un JWT_SECRET nuevo (cierra todas las sesiones).
#   ROTATE_DB=1   vuelve a pedir DATABASE_URL y DIRECT_URL.
# Los pasos y lo que va después están en infra/README.md.
set -euo pipefail

SUFFIX="${SUFFIX:?Define SUFFIX: 4 letras minúsculas o números, por ejemplo hj01}"
ALERT_EMAIL="${ALERT_EMAIL:?Define ALERT_EMAIL: el correo que recibe los avisos del presupuesto}"
LOCATION="${LOCATION:-eastus}"
SWA_LOCATION="${SWA_LOCATION:-eastus2}"
GITHUB_REPO="${GITHUB_REPO:-hjmnz-dev/cafeta-api}"
ROTATE_JWT="${ROTATE_JWT:-0}"
ROTATE_DB="${ROTATE_DB:-0}"

RG="rg-cafeta"
PLAN="plan-cafeta"
APP="cafeta-api-${SUFFIX}"
SWA_WEB="swa-cafeta-web"
SWA_ADMIN="swa-cafeta-admin"
IDENTITY="id-cafeta-deploy"
FEDERATED="github-production"
BUDGET="budget-cafeta"
RUNTIME="NODE:24-lts"
HEALTH_PATH=/api/v1/health

step() { printf '\n==> %s\n' "$1"; }
fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

[[ "$SUFFIX" =~ ^[a-z0-9]{4}$ ]] || fail "SUFFIX debe tener 4 letras minúsculas o números (recibí '$SUFFIX')."
[[ "$ALERT_EMAIL" == *@*.* ]] || fail "ALERT_EMAIL no parece un correo."

SUB_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Suscripción: $(az account show --query name -o tsv) ($SUB_ID)"

# ── 1. Grupo, plan y Web App ──
step "1/8 Grupo de recursos, plan B1 y Web App $APP"
for provider in Microsoft.Web Microsoft.ManagedIdentity; do
  az provider register --namespace "$provider" --wait -o none
done

# No se cae a otra versión por su cuenta: si Node 24 no está, se decide antes de seguir.
# Según la versión de az, la lista trae NODE:24-lts o NODE|24-lts (seguido de más columnas).
az webapp list-runtimes --os linux -o tsv | grep -qE "^NODE[:|]24-lts([[:space:]]|$)" ||
  fail "El runtime $RUNTIME no aparece en 'az webapp list-runtimes --os linux'. Revisa el spec 0006 antes de usar otra versión."

az group create -n "$RG" -l "$LOCATION" -o none
if ! az appservice plan show -g "$RG" -n "$PLAN" -o none 2>/dev/null; then
  az appservice plan create -g "$RG" -n "$PLAN" -l "$LOCATION" --is-linux --sku B1 -o none
fi
if ! az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "$RUNTIME" -o none
fi

# ── 2. Configuración y seguridad de la Web App ──
step "2/8 Always On, WebSockets, HTTPS, TLS 1.2, health check y sin autenticación básica"
az webapp config set -g "$RG" -n "$APP" \
  --always-on true \
  --web-sockets-enabled true \
  --http20-enabled true \
  --ftps-state Disabled \
  --min-tls-version 1.2 \
  --startup-file "node dist/main.js" \
  -o none
az webapp config set -g "$RG" -n "$APP" \
  --generic-configurations "{\"healthCheckPath\": \"$HEALTH_PATH\"}" -o none
az webapp update -g "$RG" -n "$APP" --https-only true -o none
for policy in scm ftp; do
  az resource update -g "$RG" \
    --namespace Microsoft.Web \
    --resource-type basicPublishingCredentialsPolicies \
    --parent "sites/$APP" \
    --name "$policy" \
    --set properties.allow=false \
    -o none
done

# ── 3. Variables sin secretos ──
step "3/8 Variables de la API sin secretos"
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  NODE_ENV=production \
  SCM_DO_BUILD_DURING_DEPLOYMENT=false \
  WEBSITE_RUN_FROM_PACKAGE=1 \
  ALLOWED_EMAIL_DOMAINS=est.intec.edu.do,intec.edu.do \
  AUTH_RATE_LIMIT=5 \
  POST_RATE_LIMIT=10

# ── 4. Static Web Apps y orígenes de CORS ──
step "4/8 Static Web Apps de la web y del admin"
for swa in "$SWA_WEB" "$SWA_ADMIN"; do
  if ! az staticwebapp show -g "$RG" -n "$swa" -o none 2>/dev/null; then
    az staticwebapp create -g "$RG" -n "$swa" -l "$SWA_LOCATION" --sku Free -o none
  fi
done
WEB_HOST="$(az staticwebapp show -g "$RG" -n "$SWA_WEB" --query defaultHostname -o tsv)"
ADMIN_HOST="$(az staticwebapp show -g "$RG" -n "$SWA_ADMIN" --query defaultHostname -o tsv)"
# Orígenes exactos: esquema y host, sin barra al final.
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  "WEB_ORIGIN=https://$WEB_HOST" \
  "ADMIN_ORIGIN=https://$ADMIN_HOST"

# ── 5. Secretos de la API (nunca se imprimen) ──
step "5/8 Secretos de la API"
has_setting() {
  local count
  count="$(az webapp config appsettings list -g "$RG" -n "$APP" --query "length([?name=='$1'])" -o tsv)"
  [[ "$count" == "1" ]]
}

if [[ "$ROTATE_JWT" == "1" ]] || ! has_setting JWT_SECRET; then
  az webapp config appsettings set -g "$RG" -n "$APP" -o none \
    --settings "JWT_SECRET=$(openssl rand -base64 48)"
  echo "JWT_SECRET nuevo guardado."
else
  echo "JWT_SECRET ya existe; se deja igual (usa ROTATE_JWT=1 para rotarlo)."
fi

if [[ "$ROTATE_DB" == "1" ]] || ! has_setting DATABASE_URL || ! has_setting DIRECT_URL; then
  echo "Pega las cadenas de Supabase (no se ven al escribir ni quedan en el historial)."
  read -rsp "DATABASE_URL (pooler en modo sesión, con sslmode=require&uselibpqcompat=true): " DATABASE_URL
  echo
  read -rsp "DIRECT_URL (la misma cadena, solo con sslmode=require): " DIRECT_URL
  echo
  [[ "$DATABASE_URL" == postgresql://*uselibpqcompat=true* ]] ||
    fail "DATABASE_URL debe empezar con postgresql:// y llevar uselibpqcompat=true."
  [[ "$DIRECT_URL" == postgresql://*sslmode=require* && "$DIRECT_URL" != *uselibpqcompat* ]] ||
    fail "DIRECT_URL debe empezar con postgresql://, llevar sslmode=require y no llevar uselibpqcompat."
  # La API no usa DIRECT_URL en runtime, pero env.validation.ts la exige para arrancar.
  az webapp config appsettings set -g "$RG" -n "$APP" -o none \
    --settings "DATABASE_URL=$DATABASE_URL" "DIRECT_URL=$DIRECT_URL"
  unset DATABASE_URL DIRECT_URL
  echo "DATABASE_URL y DIRECT_URL guardadas."
else
  echo "DATABASE_URL y DIRECT_URL ya existen; se dejan igual (usa ROTATE_DB=1 para cambiarlas)."
fi

# ── 6. Identidad de despliegue con OIDC ──
step "6/8 Identidad $IDENTITY con credencial federada para GitHub"
if ! az identity show -g "$RG" -n "$IDENTITY" -o none 2>/dev/null; then
  az identity create -g "$RG" -n "$IDENTITY" -l "$LOCATION" -o none
fi
CLIENT_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query clientId -o tsv)"
PRINCIPAL_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)"

if ! az identity federated-credential show -g "$RG" --identity-name "$IDENTITY" -n "$FEDERATED" -o none 2>/dev/null; then
  az identity federated-credential create -g "$RG" \
    --identity-name "$IDENTITY" \
    -n "$FEDERATED" \
    --issuer https://token.actions.githubusercontent.com \
    --subject "repo:${GITHUB_REPO}:environment:production" \
    --audiences api://AzureADTokenExchange \
    -o none
fi

# Solo puede desplegar la Web App de la API; nada más de la suscripción.
APP_ID="$(az webapp show -g "$RG" -n "$APP" --query id -o tsv)"
ASSIGNED="$(az role assignment list --scope "$APP_ID" --role "Website Contributor" \
  --query "length([?principalId=='$PRINCIPAL_ID'])" -o tsv)"
if [[ "$ASSIGNED" == "0" ]]; then
  az role assignment create \
    --assignee-object-id "$PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Website Contributor" \
    --scope "$APP_ID" \
    -o none
fi

# ── 7. Presupuesto ──
step "7/8 Presupuesto de 15 USD al mes con avisos al 80 % y al 100 %"
BUDGET_URL="https://management.azure.com/subscriptions/$SUB_ID/resourceGroups/$RG/providers/Microsoft.Consumption/budgets/$BUDGET?api-version=2023-05-01"
if az rest --method get --url "$BUDGET_URL" -o none 2>/dev/null; then
  echo "El presupuesto ya existe."
else
  START="$(date -u +%Y-%m-01)"
  END="$(date -u -d "$START +1 year" +%Y-%m-%d)"
  BUDGET_BODY="$(
    cat <<JSON
{
  "properties": {
    "category": "Cost",
    "amount": 15,
    "timeGrain": "Monthly",
    "timePeriod": { "startDate": "${START}T00:00:00Z", "endDate": "${END}T00:00:00Z" },
    "notifications": {
      "actual80": {
        "enabled": true,
        "operator": "GreaterThanOrEqualTo",
        "threshold": 80,
        "thresholdType": "Actual",
        "contactEmails": ["$ALERT_EMAIL"]
      },
      "actual100": {
        "enabled": true,
        "operator": "GreaterThanOrEqualTo",
        "threshold": 100,
        "thresholdType": "Actual",
        "contactEmails": ["$ALERT_EMAIL"]
      }
    }
  }
}
JSON
  )"
  if az rest --method put --url "$BUDGET_URL" --body "$BUDGET_BODY" -o none; then
    echo "Presupuesto creado."
  else
    echo "Aviso: no se pudo crear el presupuesto (algunas suscripciones de estudiante no lo permiten)." >&2
    echo "Revisa el saldo del crédito como explica infra/README.md, sección 'Costo'." >&2
  fi
fi

# ── 8. Lo que va a GitHub ──
step "8/8 Valores para los ambientes production de GitHub (no son secretos)"
API_URL="https://$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"
cat <<EOF

hjmnz-dev/cafeta-api (variables):
  AZURE_CLIENT_ID=$CLIENT_ID
  AZURE_TENANT_ID=$TENANT_ID
  AZURE_SUBSCRIPTION_ID=$SUB_ID
  AZURE_WEBAPP_NAME=$APP
  API_URL=$API_URL

hjmnz-dev/cafeta-app (variables):
  VITE_API_URL=$API_URL/api/v1
  PUBLIC_URL=https://$WEB_HOST

hjmnz-dev/cafeta-admin-web (variables):
  PUBLIC_URL=https://$ADMIN_HOST

Los tokens de Static Web Apps no se imprimen aquí. Cópialos uno a la vez con:
  az staticwebapp secrets list -n $SWA_WEB --query properties.apiKey -o tsv
  az staticwebapp secrets list -n $SWA_ADMIN --query properties.apiKey -o tsv
EOF
