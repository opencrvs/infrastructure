
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



TOKEN=`curl -X POST "https://auth.aws.opencrvs.dev/authenticate-super-user" \
     -H "Content-Type: application/json" \
     -d '{
       "username": "o.admin",
       "password": "'"$SUPER_USER_PASSWORD"'"
     }' | jq .token`

curl -H "Authorization: Bearer $TOKEN"  -X GET https://countryconfig.aws.opencrvs.dev/locations
curl -H "Authorization: Bearer $TOKEN"  -X GET https://config.aws.opencrvs.dev/locations?type=ADMIN_STRUCTURE&_count=0
curl -H "Authorization: Bearer $TOKEN"  -X GET https://gateway.aws.opencrvs.dev/locations?type=ADMIN_STRUCTURE&_count=0



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
