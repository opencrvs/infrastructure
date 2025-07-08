# https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-actions-runner-controller/quickstart-for-actions-runner-controller
# PUT TOKEN HERE BEFORE RUNNING
# export GITHUB_PAT=...
helm upgrade --install actions-runner-controller actions-runner-controller/actions-runner-controller \
    --create-namespace \
    --namespace actions-runner-system \
    --set githubWebhookServer.enabled=false \
    --set authSecret.create=true \
    --set authSecret.github_token=${GITHUB_PAT}

kubectl apply -f runner-deployment.yaml
kubectl apply -f service-account.yaml