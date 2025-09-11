# General Information

This guide describes how to deploy **OpenCRVS** with **Farajaland** sample data on a single-node Kubernetes cluster running on a virtual machine.

OpenCRVS can be deployed either:

* **Manually** (using Helm and CLI commands), see [README-on-existing-cluster](README-on-existing-cluster.md) or
* **Automatically** (using the provided GitHub Action Workflows).

---

# Prerequisites

Before starting the deployment, ensure the following requirements are met:

**1. Virtual Machine resources**

   * Minimum: **8 CPU cores, 16 GB RAM, 50 GB SSD**.

**2. Operating System**

   * VM is running **Ubuntu 24.04 LTS**.

**3. Networking and Domain Configuration**

* The VM must have a **public IP address**, or ports **80** and **443** must be accessible.
* A **valid domain name** must be configured and point to the VM.
* Required DNS records:

  * An **A record** pointing the primary domain to the VM IP (e.g., `opencrvs.example.com`).
  * A **wildcard A record** (e.g., `*.opencrvs.example.com`) or individual subdomains pointing to the same VM IP.
* These settings are required for **Traefik** to issue valid SSL certificates using Let’s Encrypt (`http-01` challenge).

> See the [OpenCRVS documentation on DNS setup](https://documentation.opencrvs.org/setup/3.-installation/3.3-set-up-a-server-hosted-environment/3.3.5-setup-dns-a-records#domain-a-records) for details.

> If you don't have public IP Address please follow guide "How to run traefik with self-signed SSL Certificate", see [TODO](#link-goes-here)

**4. Provisioning User**

   * The VM must be provisioned with an SSH user account according to [Provision Your Server Nodes with SSH Access](https://documentation.opencrvs.org/setup/3.-installation/3.3-set-up-a-server-hosted-environment/3.3.1-provision-your-server-nodes-with-ssh-access).

---

# Deployment Package Contents

The deployment package includes the following components:

* **Ingress**

  * [Traefik](https://doc.traefik.io/traefik/)

* **Datastores** (via the [OpenCRVS dependencies Helm chart](../../charts/dependencies/)):

  * MongoDB
  * PostgreSQL
  * Elasticsearch
  * Redis
  * MinIO
  * InfluxDB

* **Monitoring and Logging** (via the dependencies Helm chart):

  * Kibana
  * Logstash
  * Filebeat
  * Metricbeat
  * Elastic APM Server
  * Elastalert2

* **OpenCRVS Services** deployed with **Farajaland data** and **MOSIP integration** enabled:
  * Core packages version: `0f10027`
  * Farajaland version: `3314a9a`
  * MOSIP integration version: `latest`



# Deploy OpenCRVS with GitHub Actions Workflows

This section describes how to deploy OpenCRVS using the provided GitHub Action workflows. The workflows automate provisioning of the infrastructure, deployment of dependencies, and deployment of OpenCRVS services.

---

## 1. Prepare GitHub Repository

1. **Fork the repository**

   * Fork [opencrvs/infrastructure](https://github.com/opencrvs/infrastructure) into your own GitHub account or organization.

2. **Create a GitHub environment**

   * In your forked repository, create an environment named `dev`.

3. **Add GitHub secrets** under the `dev` environment:

   * **`GH_TOKEN`** – GitHub token with **read/write access** to workflows (repository or environment level).
   * **`ENCRYPTION_KEY`** – encryption key for the `/data` partition.

     > 🔑 Store this key in a secure password manager for future use.

4. **Add GitHub variables** under the `dev` environment:

   * **`DISK_SPACE`** – disk size for the encrypted partition. For testing, `5g` is sufficient.
   * **`DOMAIN`** – the domain name associated with your VM.

---

## 2. Bootstrap GitHub Self-Hosted Runner

The self-hosted runner must be installed on the VM (or master node).

You will need to provide the following values while installation:

* GitHub organization or account name: `<your-org-or-account>`
* GitHub repository name: `<your-repository>`
* GitHub PAT (personal access token) with access to repository code and workflows: `<GH_TOKEN or dedicated token>`
* Environment name: `dev`

Run the following command on the VM:

```bash
curl -s https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/github-runner/node-runner.sh -o runner.sh && bash runner.sh
```

If successful, you will see a confirmation message:

```
✅ Runner '....-runner' is installed and started!
```

In your GitHub repository, navigate to **Settings → Actions → Runners** and verify that the runner appears as a self-hosted runner.

---

## 3. Prepare Inventory File for Infrastructure Deployment

1. Navigate to the `infrastructure/server-setup/inventory` folder.
2. Create a configuration file for your environment, see example.

   * The file name must match the GitHub environment name.
   * Example: if your environment is `dev`, the file name should be `dev.yml`.
3. Commit your changes.
4. Ensure the **`update-envs` workflow** has completed successfully before proceeding.

Example configuration file (`dev.yml`):

```yaml
all:
  vars:
    kube_api_sans: []
    # FIXME: -o StrictHostKeyChecking=no should not be required
    ansible_ssh_common_args: '-o StrictHostKeyChecking=no'
    ansible_user: provision
    single_node: true
    users:
      - name: myuser
        ssh_keys:
          - ssh-ed25519 AAAAC3N...cN/5HAjKGbi2DqV7g/Q
        state: present
        # FIXME: https://github.com/opencrvs/opencrvs-core/issues/6267
        role: admin
  children:
    master:
      hosts:
        test-k8s-master:
          ansible_host: <your-vm-ip>
```

---

## 4. Run Infrastructure Provision

* Trigger the **provision workflow** from your repository.
* Verify that the Kubernetes self-hosted runner is visible under **Settings → Actions → Runners**.

---

## 5. Prepare and Run Dependencies Deployment

> NOTE: One kubernetes cluster (even single node) is capable to host multiple OpenCRVS instances. Environment name (`dev`) may differ from OpenCRVS dependencies installation environment.

1. Copy the default values file:

   ```bash
   cp examples/dev/dependencies/values.yaml environments/dev/dependencies/values.yaml
   ```
2. Adjust values if needed. The provided defaults are usually sufficient to start.
3. Run the **Dependencies deployment workflow**.
4. Verify that **MinIO** and **Kibana** are available.

---

## 6. Prepare and Run OpenCRVS Deployment
> NOTE: One kubernetes cluster (even single node) is capable to host multiple OpenCRVS instances. Environment name (`dev`) may differ from OpenCRVS dependencies installation environment.

1. Copy the default values file:

   ```bash
   cp examples/dev/opencrvs-services/values.yaml environments/dev/opencrvs-services/values.yaml
   ```
2. Adjust values if needed. The provided defaults are usually sufficient to start.
3. Run the **OpenCRVS deployment workflow**.
4. Verify that the **OpenCRVS login page** is accessible via your configured domain.

---

✅ At this point, OpenCRVS should be successfully deployed on your single-node Kubernetes cluster.

