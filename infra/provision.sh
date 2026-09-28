#!/usr/bin/env bash
# Crea la infraestructura de producción de Cafeta en Azure (spec 0006).
# Se corre desde Azure Cloud Shell (Bash), que ya trae `az` con tu sesión.
#
#   SUFFIX=hj01 ALERT_EMAIL=tu@correo.com bash provision.sh
#
# Se puede volver a correr: lo que ya existe no se crea de nuevo. Para rotar secretos:
#   ROTATE_JWT=1  genera un JWT_SECRET nuevo (cierra todas las sesiones).
#   ROTATE_DB=1   vuelve a pedir DATABASE_URL y DIRECT_URL.
# Los pasos y lo que va después están en infra/README.md.
set -euo pipefail

SUFFIX="${SUFFIX:?Define SUFFIX: 4 letras minúsculas o números, por ejemplo hj01}"
ALERT_EMAIL="${ALERT_EMAIL:?Define ALERT_EMAIL: el correo que recibe los avisos del presupuesto}"
LOCATION="${LOCATION:-canadacentral}"
GITHUB_OWNER="${GITHUB_OWNER:-hjmnz-dev}"
ROTATE_JWT="${ROTATE_JWT:-0}"
ROTATE_DB="${ROTATE_DB:-0}"

RG="rg-cafeta"
PLAN="plan-cafeta"
API="cafeta-api-${SUFFIX}"
WEB="cafeta-web-${SUFFIX}"
ADMIN="cafeta-admin-${SUFFIX}"
APPS=("$API" "$WEB" "$ADMIN")
IDENTITY="id-cafeta-deploy"
BUDGET="budget-cafeta"
BUDGET_USD=20
RUNTIME="NODE:24-lts"
HEALTH_PATH=/api/v1/health

# Una credencial federada por repo: nombre y repo de GitHub.
FEDERATED=(
  "github-api:${GITHUB_OWNER}/cafeta-api"
  "github-web:${GITHUB_OWNER}/cafeta-app"
  "github-admin:${GITHUB_OWNER}/cafeta-admin-web"
)

step() { printf '\n==> %s\n' "$1"; }
fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}
host_of() { az webapp show -g "$RG" -n "$1" --query defaultHostName -o tsv; }

[[ "$SUFFIX" =~ ^[a-z0-9]{4}$ ]] || fail "SUFFIX debe tener 4 letras minúsculas o números (recibí '$SUFFIX')."
[[ "$ALERT_EMAIL" == *@*.* ]] || fail "ALERT_EMAIL no parece un correo."

SUB_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Suscripción: $(az account show --query name -o tsv) ($SUB_ID)"

# Azure for Students solo deja crear recursos en algunas regiones. Nunca se elige otra por su cuenta.
ALLOWED="$(az policy assignment list --query "[].parameters.listOfAllowedLocations.value[]" -o tsv 2>/dev/null || true)"
if [[ -n "$ALLOWED" ]] && ! grep -qx "$LOCATION" <<<"$ALLOWED"; then
  fail "La suscripción no permite '$LOCATION'. Regiones permitidas: $(tr '\n' ' ' <<<"$ALLOWED")"
fi

# ── 1. Grupo, plan y las tres Web Apps ──
step "1/8 Grupo de recursos, plan B1 y Web Apps $API, $WEB y $ADMIN"
for provider in Microsoft.Web Microsoft.ManagedIdentity; do
  az provider register --namespace "$provider" --wait -o none
done

# No se cae a otra versión por su cuenta: si Node 24 no está, se decide antes de seguir.
# Según la versión de az, la lista trae NODE:24-lts o NODE|24-lts (seguido de más columnas).
az webapp list-runtimes --os linux -o tsv | grep -qE "^NODE[:|]24-lts([[:space:]]|$)" ||
  fail "El runtime $RUNTIME no aparece en 'az webapp list-runtimes --os linux'. Revisa el spec 0006 antes de usar otra versión."

# Un grupo que ya existe no cambia de región; sus recursos igual van en $LOCATION.
if [[ "$(az group exists -n "$RG")" != "true" ]]; then
  az group create -n "$RG" -l "$LOCATION" -o none
fi
if ! az appservice plan show -g "$RG" -n "$PLAN" -o none 2>/dev/null; then
  az appservice plan create -g "$RG" -n "$PLAN" -l "$LOCATION" --is-linux --sku B1 -o none
fi
for app in "${APPS[@]}"; do
  if ! az webapp show -g "$RG" -n "$app" -o none 2>/dev/null; then
    az webapp create -g "$RG" -p "$PLAN" -n "$app" --runtime "$RUNTIME" -o none
  fi
done

# ── 2. Configuración y seguridad de las Web Apps ──
step "2/8 Always On, HTTPS, TLS 1.2, sin FTP ni autenticación básica; WebSockets y health check en la API"
configure() {
  local app="$1" sockets="$2" startup="$3"
  az webapp config set -g "$RG" -n "$app" \
    --always-on true \
    --web-sockets-enabled "$sockets" \
    --http20-enabled true \
    --ftps-state Disabled \
    --min-tls-version 1.2 \
    --startup-file "$startup" \
    -o none
  az webapp update -g "$RG" -n "$app" --https-only true -o none
  for policy in scm ftp; do
    az resource update -g "$RG" \
      --namespace Microsoft.Web \
      --resource-type basicPublishingCredentialsPolicies \
      --parent "sites/$app" \
      --name "$policy" \
      --set properties.allow=false \
      -o none
  done
}
configure "$API" true "node dist/main.js"
az webapp config set -g "$RG" -n "$API" \
  --generic-configurations "{\"healthCheckPath\": \"$HEALTH_PATH\"}" -o none
configure "$WEB" false "node server.mjs"
configure "$ADMIN" false "node server.mjs"

# ── 3. Variables sin secretos ──
step "3/8 Variables sin secretos"
for app in "${APPS[@]}"; do
  az webapp config appsettings set -g "$RG" -n "$app" -o none --settings \
    NODE_ENV=production \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    WEBSITE_RUN_FROM_PACKAGE=1
done
az webapp config appsettings set -g "$RG" -n "$API" -o none --settings \
  ALLOWED_EMAIL_DOMAINS=est.intec.edu.do,intec.edu.do \
  AUTH_RATE_LIMIT=5 \
  POST_RATE_LIMIT=10

# ── 4. Orígenes de CORS ──
step "4/8 WEB_ORIGIN y ADMIN_ORIGIN de la API"
WEB_HOST="$(host_of "$WEB")"
ADMIN_HOST="$(host_of "$ADMIN")"
# Orígenes exactos: esquema y host, sin barra al final.
az webapp config appsettings set -g "$RG" -n "$API" -o none --settings \
  "WEB_ORIGIN=https://$WEB_HOST" \
  "ADMIN_ORIGIN=https://$ADMIN_HOST"

# ── 5. Secretos de la API (nunca se imprimen) ──
step "5/8 Secretos de la API"
has_setting() {
  local count
  count="$(az webapp config appsettings list -g "$RG" -n "$API" --query "length([?name=='$1'])" -o tsv)"
  [[ "$count" == "1" ]]
}

if [[ "$ROTATE_JWT" == "1" ]] || ! has_setting JWT_SECRET; then
  az webapp config appsettings set -g "$RG" -n "$API" -o none \
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
  az webapp config appsettings set -g "$RG" -n "$API" -o none \
    --settings "DATABASE_URL=$DATABASE_URL" "DIRECT_URL=$DIRECT_URL"
  unset DATABASE_URL DIRECT_URL
  echo "DATABASE_URL y DIRECT_URL guardadas."
else
  echo "DATABASE_URL y DIRECT_URL ya existen; se dejan igual (usa ROTATE_DB=1 para cambiarlas)."
fi

# ── 6. Identidad de despliegue con OIDC ──
step "6/8 Identidad $IDENTITY con una credencial federada por repo"
if ! az identity show -g "$RG" -n "$IDENTITY" -o none 2>/dev/null; then
  az identity create -g "$RG" -n "$IDENTITY" -l "$LOCATION" -o none
fi
CLIENT_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query clientId -o tsv)"
PRINCIPAL_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)"

for entry in "${FEDERATED[@]}"; do
  name="${entry%%:*}"
  subject="repo:${entry#*:}:environment:production"
  # Azure no acepta dos credenciales con el mismo subject; se revisa por subject, no por nombre.
  existing="$(az identity federated-credential list -g "$RG" --identity-name "$IDENTITY" \
    --query "length([?subject=='$subject'])" -o tsv)"
  if [[ "$existing" == "0" ]]; then
    az identity federated-credential create -g "$RG" \
      --identity-name "$IDENTITY" \
      -n "$name" \
      --issuer https://token.actions.githubusercontent.com \
      --subject "$subject" \
      --audiences api://AzureADTokenExchange \
      -o none
  fi
done

# Solo puede desplegar las tres Web Apps; nada más de la suscripción.
for app in "${APPS[@]}"; do
  app_id="$(az webapp show -g "$RG" -n "$app" --query id -o tsv)"
  assigned="$(az role assignment list --scope "$app_id" --role "Website Contributor" \
    --query "length([?principalId=='$PRINCIPAL_ID'])" -o tsv)"
  if [[ "$assigned" == "0" ]]; then
    az role assignment create \
      --assignee-object-id "$PRINCIPAL_ID" \
      --assignee-principal-type ServicePrincipal \
      --role "Website Contributor" \
      --scope "$app_id" \
      -o none
  fi
done

# ── 7. Presupuesto ──
step "7/8 Presupuesto de $BUDGET_USD USD al mes con avisos al 80 % y al 100 %"
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
    "amount": $BUDGET_USD,
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

# ── 8. Resumen ──
step "8/8 Listo"
cat <<EOF

API:    https://$(host_of "$API")
Web:    https://$WEB_HOST
Admin:  https://$ADMIN_HOST
Identidad de despliegue: $IDENTITY (clientId $CLIENT_ID, tenant $TENANT_ID)

Siguiente paso: cargar GitHub con
  gh auth login
  SUFFIX=$SUFFIX bash github-env.sh
EOF
