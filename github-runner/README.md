# How to deploy self-hosted runner on Kubernetes cluster

> **NOTE:** Self-hosted runner is compatible with any kubernetes cluster including minikube on Linux or Apple Silicon, but tested on kubeadm, AWS and Google Cloud managed clusters only.

Run following command:
```
export GITHUB_PAT=<your PAT with access to repository code and workflows>
export GIT_REPOSITORY=<your repository>
./deploy-runner.sh
```

Check you repository configuration -> action runners