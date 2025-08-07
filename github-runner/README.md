> NOTE: Choose one of available options:
> - For On-Premise infrastructure managed by GitHub actions workflows please use node self-hosted runner.
> - For OpenCRVS hosted on Cloud infrastructure or On-Premise K8s cluster managed manually please use self-hosted runner on kubernetes. 

# How to deploy self-hosted runner on Kubernetes cluster?

Self-hosted k8s runner is compatible with any kubernetes cluster including minikube on Linux or Apple Silicon. Certificate manager is required as hard dependency and is included in installation script. 

Run following command:
```
export GITHUB_PAT=<your PAT with access to repository code and workflows>
export GIT_REPOSITORY=<your repository>
./k8s-runner.sh
```

Check you repository configuration -> action runners

# How to deploy self-hosted runner on Node?

> **NOTE:** Don't use node-runner for Cloud infrastructure.

Node runner is used for running GitHub Actions provision workflow to deploy Kubernetes cluster and configure node (VM) for OpenCRVS.


Run following command:
```
curl -s https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/polish-install-process/github-runner/node-runner.sh -o runner.sh && bash runner.sh
```

