
> [!NOTE]
> Please keep your infrastructure repository up to date with OpenCRVS Core version.
> Always update infrastructure to same version as OpenCRVS Core.

---

# General Information

This document provides guidance on running OpenCRVS on server environments using Kubernetes. It is intended for System Administrators and DevOps engineers deploying OpenCRVS in various environments.

> [!WARNING]
> For comprehensive documentation, installation guides, and infrastructure setup instructions, please refer to the **[Official OpenCRVS Documentation](https://documentation.opencrvs.org/)**.

# Repository content

- **[infrastructure](infrastructure): Infrastructure-as-code scripts (ansible) and resources for provisioning and managing foundational services (such as databases, networks, or storage).**
- [environments](environments): Template folder to store helm values configurations for different environments (e.g., development, staging, production).
- [examples](examples): Pre-defined values for Helm charts and additional documentation or deployment scenarios for OpenCRVS.
- [scripts](scripts): Utility scripts for OpenCRVS bootstrap and some one time maintenance tasks.

> [!NOTE]
> The OpenCRVS Core and Country config template repositories each have their own Tiltfile.

# Cloud-native environments

Clusters provisioned with this repository (the `provision` workflow) get the namespaces, the permissions of the CI runner and Traefik from provisioning.
Cloud-native clusters (EKS, GKE, AKS and others, for example created with the [Cloud Infrastructure](https://github.com/opencrvs/cloud-infrastructure) templates) are not provisioned by it.
Prepare the following before running the deployment workflows for the first time.

## Namespaces

Create one namespace per component of every environment. Replace `<env>` with the name of the GitHub environment:

| Namespace             | Used by                                                         |
| --------------------- | --------------------------------------------------------------- |
| `opencrvs-deps-<env>` | OpenCRVS dependencies (`02. Deploy Dependencies`)               |
| `opencrvs-<env>`      | OpenCRVS services (`03. Deploy OpenCRVS`)                       |
| `traefik`             | Traefik and its static TLS certificate secret, once per cluster |

```bash
kubectl create namespace opencrvs-deps-<env>
kubectl create namespace opencrvs-<env>
kubectl create namespace traefik
```

The Kubernetes identity used by the self-hosted runner must be allowed to manage the resources of the Helm charts in the first two namespaces.
On provisioned clusters this is the `opencrvs-deployer` ClusterRole, bound with a RoleBinding in each namespace, see
[`self-hosted-runner-rbac.yml`](infrastructure/server-setup/tasks/k8s/self-hosted-runner-rbac.yml) for the rules.

## Traefik

Traefik is installed by provisioning, not by the deployment workflows. Install it on cloud-native clusters before deploying the dependencies,
with the values of the environment. The chart version is `traefik_chart_version` in [`group_vars/all.yml`](infrastructure/server-setup/group_vars/all.yml):

```bash
helm upgrade --install traefik oci://ghcr.io/traefik/helm/traefik \
  --version <traefik_chart_version> \
  --namespace traefik \
  -f environments/<env>/traefik/values.yaml \
  -f environments/<env>/traefik/values.override.yaml
```


# Additional resources

- [Official documentation](https://documentation.opencrvs.org/)
- [OpenCRVS Helm Chart README](https://github.com/opencrvs/opencrvs-helm-charts/blob/develop/charts/opencrvs-services/README.md)
- [Dependencies Helm Chart README](https://github.com/opencrvs/opencrvs-helm-charts/blob/develop/charts/dependencies/README.md)
- [Cloud Infrastructure](https://github.com/opencrvs/cloud-infrastructure), Additional repository with terraform templates and other tools to deploy OpenCRVS on Cloud Providers.
- [OpenCRVS Helm Charts](https://github.com/opencrvs/opencrvs-helm-charts), OpenCRVS helm charts for application deployment
