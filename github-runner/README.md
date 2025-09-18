# General information

This folder contains scripts for deploying GitHub Action self-runners and Dockerfile for building kubernetes self-hosted runner image.


Choose one of available options:
| Infrastructure configuration | Runner deployment scenario |
|---|---|
| **On-Premise infrastructure managed by GitHub actions provision workflows**. Node level runner will handle provision workflow only. Provision workflow will manage k8s runner setup. | Node runner |
| **Cloud infrastructure**. On Cloud environments only k8s runner is needed to handle deployment, data seed, data reset and other OpenCRVS related workflows. | K8s runner |

# How to deploy self-hosted runner on Kubernetes cluster?

Self-hosted k8s runner is compatible with any kubernetes cluster including minikube on Linux or Apple Silicon. Certificate manager is required as hard dependency and is included in installation script. 

Make sure you are connected to correct cluster:
```
kubectl config current-context
```

Example output:
```
vmudryi@public-k8s
```
Output format:
```
<username>@<cluster-name>
```


Install runner by running following command:
```
export GITHUB_PAT=<your PAT with access to repository code and workflows>
export GIT_REPOSITORY=<your repository>
./k8s-runner.sh
```

Check you repository configuration -> action runners

# How to deploy self-hosted runner on Node?

> **NOTE:** Don't use node-runner for Cloud infrastructure.
> Node runner is used for running GitHub Actions provision workflow to deploy Kubernetes cluster and configure node (VM) for OpenCRVS.


Run following command:
```
curl -s https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/polish-install-process/github-runner/node-runner.sh -o runner.sh && bash runner.sh
```

