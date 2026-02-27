# How to deploy self-hosted runner on Node?

> **NOTE:** Don't use node-runner for Cloud infrastructure.

Runner installation is managed by [`opencrvs-bootstrap.sh`](./opencrvs-bootstrap.sh)

Node runner is used for running GitHub Actions provision workflow to deploy Kubernetes cluster and configure node (VM) for OpenCRVS.


Run following command:
```
curl -s https://raw.githubusercontent.com/opencrvs/infrastructure/develop/scripts/bootstrap/node-runner.sh -o runner.sh && bash runner.sh
```
