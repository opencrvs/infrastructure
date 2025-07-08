# https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-actions-runner-controller/quickstart-for-actions-runner-controller
# PUT TOKEN HERE BEFORE RUNNING
# export GITHUB_PAT=...
[ "$GITHUB_PAT" == "" ] && \
   echo "Please add GitHub Personal access token (GITHUB_PAT) before running this script" && exit 1
echo $GITHUB_PAT
# Cert manager is a dependency for GitHub Runner
helm install \
   cert-manager jetstack/cert-manager \
   --namespace cert-manager \
   --create-namespace \
   --version v1.17.0 \
   --set crds.enabled=true

helm upgrade --install actions-runner-controller actions-runner-controller/actions-runner-controller \
    --create-namespace \
    --namespace actions-runner-system \
    --set githubWebhookServer.enabled=false \
    --set authSecret.create=true \
    --set authSecret.github_token=${GITHUB_PAT}

kubectl apply -f runner-deployment.yaml
kubectl apply -f service-account.yaml