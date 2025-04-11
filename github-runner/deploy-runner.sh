# https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-actions-runner-controller/quickstart-for-actions-runner-controller

helm upgrade --install actions-runner-controller actions-runner-controller/actions-runner-controller \
    --create-namespace \
    --namespace actions-runner-system \
    --set githubWebhookServer.enabled=false \
    --set authSecret.create=true \
    --set authSecret.github_token=${GITHUB_PAT}

# NAMESPACE="arc-systems"
# helm upgrade --install arc \
#     --namespace "${NAMESPACE}" \
#     --create-namespace \
#     oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# INSTALLATION_NAME="arc-runner-set"
# NAMESPACE="arc-runners"
# GITHUB_CONFIG_URL="https://github.com/opencrvs/infrastructure"
# GITHUB_PAT=${GITHUB_PAT}
# helm upgrade --install "${INSTALLATION_NAME}" \
#     --namespace "${NAMESPACE}" \
#     --create-namespace \
#     --set githubConfigUrl="${GITHUB_CONFIG_URL}" \
#     --set githubConfigSecret.github_token="${GITHUB_PAT}" \
#     --set runnerScaleSetName="opencrvs-dev" \
#     -f values.yaml \
#     oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

kubectl apply -f runner-deployment.yaml
