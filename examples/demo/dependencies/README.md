ENV=demo;


helm upgrade --install opencrvs-deps charts/dependencies/ \
            --namespace "opencrvs-deps-${ENV}" \
            -f examples/${ENV}/dependencies/values.yaml \
            --create-namespace \
            --set environment="$ENV" \
            --set storage_type=host_path