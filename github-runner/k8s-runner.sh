#!/bin/bash
# Reference documentation page: Quickstart for Actions Runner Controller
# https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-actions-runner-controller/quickstart-for-actions-runner-controller

SCRIPT_DIR=$(dirname $0)

[ "$GITHUB_PAT" == "" ] && \
  echo "Please add GitHub Personal access token as environment variable GITHUB_PAT before running this script" && exit 1
[ "$GIT_REPOSITORY" == "" ] && \
  echo "Please add GitHub repository as environment variable GIT_REPOSITORY before running this script" && exit 1

# Cert manager is a dependency for GitHub Runner
# Sometimes it is pre-installed and to avoid overrides we need to check cert-manager namespace
kubectl get ns cert-manager >/dev/null 2>&1
[ $? -eq 1 ] && \
echo "📦 running cert-manager installation" && \
helm upgrade --install \
   cert-manager jetstack/cert-manager \
   --namespace cert-manager \
   --create-namespace \
   --version v1.17.0 \
   --set crds.enabled=true

RUNNER_NAMESPACE=actions-runner-system
echo "📦 running actions-runner installation"
helm upgrade --install actions-runner-controller actions-runner-controller/actions-runner-controller \
    --create-namespace \
    --namespace $RUNNER_NAMESPACE \
    --set githubWebhookServer.enabled=false \
    --set authSecret.create=true \
    --set webhook.certManager.enabled=true \
    --set authSecret.github_token=${GITHUB_PAT}

echo "👷 Creating runner deployment in namespace "
sed "s#REPOSITORY_PLACEHOLDER#$GIT_REPOSITORY#" ${SCRIPT_DIR}/runner-deployment.yaml | kubectl apply -f -

echo "🔒 Apply all required permissions for self-hosted runner service account"
kubectl apply -f ${SCRIPT_DIR}/service-account.yaml
