
secrets=(
    "redis-opencrvs-users"
    "minio-opencrvs-users"
)
for secret in "${secrets[@]}"; do
    kubectl get secret $secret -n opencrvs-deps-${ENV} -o yaml \
    | sed "s#namespace: opencrvs-deps-${ENV}#namespace: opencrvs-${ENV}#" \
    | grep -vE 'resourceVersion|uid|creationTimestamp' \
    | kubectl apply -n opencrvs-${ENV} -f - \
    || echo "Secret $secret doesn't exist in opencrvs-deps-${ENV} namespace"
done

helm upgrade --install opencrvs oci://ghcr.io/opencrvs/opencrvs-services:0.0.1 \
    --namespace "opencrvs-${ENV}" \
    -f infrastructure/${ENV}/opencrvs-services/values.yaml \
    --create-namespace \
    --set core.image.tag="$CORE_IMAGE_TAG" \
    --set countryconfig.image.tag="$COUNTRYCONFIG_IMAGE_TAG" \
    --set environment="$ENV"

helm template  -f infrastructure/${ENV}/opencrvs-services/values.yaml \
    --set data_seed.enabled=true \
    -s templates/data-seed-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -

DOMAIN=aws.opencrvs.dev

curl -X POST "https://auth.$DOMAIN/authenticate-super-user" \
     -H "Content-Type: application/json" \
     -d '{
       "username": "o.admin",
       "password": "'"$SUPER_USER_PASSWORD"'"
     }'

TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6WyJieXBhc3NyYXRlbGltaXQiLCJ1c2VyLmRhdGEtc2VlZGluZyJdLCJpYXQiOjE3NDY3MDEyNzQsImV4cCI6MTc0NzMwNjA3NCwiYXVkIjpbIm9wZW5jcnZzOmF1dGgtdXNlciIsIm9wZW5jcnZzOnVzZXItbWdudC11c2VyIiwib3BlbmNydnM6aGVhcnRoLXVzZXIiLCJvcGVuY3J2czpnYXRld2F5LXVzZXIiLCJvcGVuY3J2czpub3RpZmljYXRpb24tdXNlciIsIm9wZW5jcnZzOndvcmtmbG93LXVzZXIiLCJvcGVuY3J2czpzZWFyY2gtdXNlciIsIm9wZW5jcnZzOm1ldHJpY3MtdXNlciIsIm9wZW5jcnZzOmNvdW50cnljb25maWctdXNlciIsIm9wZW5jcnZzOndlYmhvb2tzLXVzZXIiLCJvcGVuY3J2czpjb25maWctdXNlciIsIm9wZW5jcnZzOmRvY3VtZW50cy11c2VyIl0sImlzcyI6Im9wZW5jcnZzOmF1dGgtc2VydmljZSIsInN1YiI6IjY4MWM1OWE3M2E4MWVlZDFlYzM0ZTQyZiJ9.kzb10NXG657_hOTW8sBzD2eqxRbfjPBMvLeU0b89gwM_C42-6QS4rhDNrZ06UEg39C5szInXoKIbFAIqXnFeWjpEN9dg--IZ1ftKHmK54dRaQfIKr7FYYpAGKsQkbplOt_LdM7DWKwwXxwqvg-dE3vfze4AbOQcMHtF8sBiipd35JvV3a0qRsL7yneTn_YLA8kt0jsr8dneT3uRGK-wMsM-xqFWeYYs21rP-hVcblHzSDIkmyW7EXwjd0EhLLnfa1-TIbT7OvHJhZgECvKLf4do5t3pqRGYQpntlm3vrg7w9WT26SQ6zPs2Mdckv4HoNvrAn-PgatBI-y4yv7K-I5A


curl -H "Authorization: Bearer $TOKEN"  -X GET https://gateway.$DOMAIN/locations?type=ADMIN_STRUCTURE&_count=0


helm template -f infrastructure/${ENV}/opencrvs-services/values.yaml \
    --set data_cleanup.enabled=true \
    -s templates/data-cleanup-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -

helm template -f infrastructure/${ENV}/opencrvs-services/values.yaml \
    -s templates/data-migration-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -

helm template  -f infrastructure/${ENV}/opencrvs-services/values.yaml \
    --set data_seed.enabled=true \
    -s templates/data-seed-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -
