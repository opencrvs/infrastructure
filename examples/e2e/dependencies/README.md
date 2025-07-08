ENV=demo;
helm upgrade --install opencrvs-deps oci://ghcr.io/opencrvs/opencrvs-dependencies-chart:0.1.1 \
            --namespace "opencrvs-deps-${ENV}" \
            -f infrastructure/${ENV}/dependencies/values.yaml \
            --create-namespace \
            --set environment="$ENV"
