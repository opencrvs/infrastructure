
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

The `provision` workflow of this repository prepares a cluster for the deployment workflows. It creates the namespaces, gives the CI runner access to them, and installs Traefik.
Cloud-native clusters (EKS, GKE, AKS and others, for example from the [Cloud Infrastructure](https://github.com/opencrvs/cloud-infrastructure) templates) do not use this workflow.
Prepare these items before you run the deployment workflows for the first time.

## Namespaces

Create one namespace for each component of every environment. Replace `<env>` with the name of the GitHub environment:

| Namespace             | Used by                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| `opencrvs-deps-<env>` | OpenCRVS dependencies (`02. Deploy Dependencies`)                                   |
| `opencrvs-<env>`      | OpenCRVS services (`03. Deploy OpenCRVS`)                                           |
| `traefik`             | Traefik and its static TLS certificate secret. Create it one time for each cluster. |

```bash
kubectl create namespace opencrvs-deps-<env>
kubectl create namespace opencrvs-<env>
kubectl create namespace traefik
```

The Kubernetes user of the self-hosted runner must be able to manage the resources of the Helm charts in the first two namespaces. It must also be able to manage the secret `traefik-cert` in the `traefik` namespace.
On provisioned clusters, the `opencrvs-deployer` ClusterRole and a RoleBinding in each namespace give this access. See [`self-hosted-runner-rbac.yml`](infrastructure/server-setup/tasks/k8s/self-hosted-runner-rbac.yml) for the rules.

## Monitoring cluster roles

If `monitoring.enabled` is `true`, Filebeat and Metricbeat need the ClusterRoles and ClusterRoleBindings `filebeat` and `metricbeat`. The dependencies chart does not create them (`create_cluster_roles: false`). Provisioning creates them ([`monitoring-rbac.yml`](infrastructure/server-setup/tasks/k8s/monitoring-rbac.yml)).

Only one environment of a cluster has monitoring. It is the provision environment. Provisioning skips the objects only if the `MONITORING_ENABLED` variable of this environment is `false`.
The bindings use the default ServiceAccounts of the chart (`filebeat.service_account_name`, `metricbeat.service_account_name`) in the dependencies namespace of this environment.

On cloud-native clusters, do one of these steps:

- Set `create_cluster_roles: true` in `environments/<env>/dependencies/values.yaml`.
- Create the objects yourself. See [Cluster roles](https://github.com/opencrvs/opencrvs-core/blob/develop/charts/dependencies/README.md#cluster-roles) in the chart README.

## Traefik

Provisioning installs Traefik. The deployment workflows do not. On cloud-native clusters, install Traefik before you deploy the dependencies. Use the values of the environment.
The chart version is `traefik_chart_version` in [`group_vars/all.yml`](infrastructure/server-setup/group_vars/all.yml):

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
