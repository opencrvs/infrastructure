# Run OpenCRVS on localhost

1. Install traefik
```
helm upgrade --install traefik oci://ghcr.io/traefik/helm/traefik \
    --namespace traefik \
    --create-namespace \
    -f https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/examples/localhost/traefik/values.yaml
```
2. Install dependencies
```
helm upgrade --install opencrvs-deps oci://ghcr.io/opencrvs/opencrvs-dependencies-chart \
    --namespace "opencrvs-deps-dev" \
    --create-namespace \
    --set hostname=opencrvs.localhost \
    --atomic \
    -f https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/examples/localhost/dependencies/values-dev.yaml
```
3. Install OpenCRVS
```
helm upgrade --install opencrvs oci://ghcr.io/opencrvs/opencrvs-services \
    --timeout 15m \
    --namespace "opencrvs-dev" \
    --create-namespace \
    --atomic \
    -f https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/examples/localhost/opencrvs-services/values-dev.yaml
```
4. Seed data
```
helm get values opencrvs --namespace "opencrvs-dev" \
    | helm template -f - \
        --set data_seed.enabled=true \
        --namespace "opencrvs-dev" \
        -s templates/data-seed-job.yaml \
        oci://ghcr.io/opencrvs/opencrvs-services \
    | kubectl apply --namespace "opencrvs-dev" -f -
```