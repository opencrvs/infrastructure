# General Information

This guide describes how to deploy **OpenCRVS** with **Farajaland** sample data on a single-node Kubernetes cluster running on a virtual machine.

OpenCRVS can be deployed either:

* **Manually** (using Helm and CLI commands), see [README-on-existing-cluster](README-on-existing-cluster.md) or
* **Automatically** (using the provided GitHub Action Workflows).
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
  * Core packages version: `v1.9.0-beta-1`
  * Farajaland version: `v1.9.0-beta-1`
  * MOSIP integration version: `latest`


---

# Prerequisites

Before starting the deployment, ensure the following requirements are met:

**1. Virtual Machine resources**

   * Minimum: **8 CPU cores, 16 GB RAM, 50 GB SSD**.

**2. Operating System**

   * VM is running **Ubuntu 24.04 LTS**.

**3. Networking and Domain Configuration**

* The VM must have a **public IP address** and (or) ports **80** and **443** must be accessible.
* A **valid domain name** must be configured and point to the VM.
* Required DNS records:

  * An **A record** pointing the primary domain to the VM IP (e.g., `opencrvs.example.com`).
  * A **wildcard A record** (e.g., `*.opencrvs.example.com`) or individual subdomains pointing to the same VM IP.
* These settings are required for **Traefik** to issue valid SSL certificates using Let’s Encrypt (`http-01` challenge).

> See the [OpenCRVS documentation on DNS setup](https://documentation.opencrvs.org/setup/3.-installation/3.3-set-up-a-server-hosted-environment/3.3.5-setup-dns-a-records#domain-a-records) for details.

> If you don't have public IP Address please follow guide "How to run traefik with self-signed SSL Certificate", see [TODO](#link-goes-here)

---

# Deploy OpenCRVS with GitHub Actions Workflows

This section describes how to deploy OpenCRVS using the provided GitHub Action workflows. The workflows automate provisioning of the infrastructure, deployment of dependencies, and deployment of OpenCRVS services.

Fork [opencrvs/infrastructure](https://github.com/opencrvs/infrastructure) into your own GitHub account or organization.

You will need to provide the following values while installation multiple times:

* GitHub organization or account name: `<your-org-or-account>`
* GitHub repository name: `<your-repository>`
* GitHub PAT (personal access token) with access to repository code and workflows: `<GH_TOKEN or dedicated token>`
* Environment name: `<env name>`
---

---
## 1.  Create a GitHub environment

* Checkout forked infrastructure repository into any folder on your laptop
  ```
  git clone <repository url>
  ```
* Install yarn dependencies:
  ```
  yarn
  ```
* Create environment:
  ```
  yarn environment:init
  ```
* Go to GitHub and verify the newly created environment


## 2.1. Bootstrap GitHub Self-Hosted Runner

The self-hosted runner must be installed on the single VM (master node). The VM must be provisioned with an SSH user account according to [Provision Your Server Nodes with SSH Access](https://documentation.opencrvs.org/setup/3.-installation/3.3-set-up-a-server-hosted-environment/3.3.1-provision-your-server-nodes-with-ssh-access).

> NOTE: On previous step environment configuration script left correct command as output.

1. Login as any user with sudo or root access

2. Run the following command on the VM:
    ```bash
    curl -sfL https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/ocrvs-9792/scripts/bootstrap/opencrvs-bootstrap.sh -o opencrvs-bootstrap.sh | \
    bash opencrvs-bootstrap.sh --owner <org name> \
                --repo <repo name> \
                --env <env name> \
                --token <github token> \
                --enable-runner
    ```

**Verify runner is available**

1. If successful, you will see a confirmation message:
    ```
    ✅ Runner '....-runner' is installed and started!
    ```
2. In your GitHub repository, navigate to **Settings → Actions → Runners** and verify that the runner appears as a self-hosted runner.

### 2.2 Update infrastructure configuration

* Navigate to the `infrastructure/server-setup/inventory` folder.
* Open a configuration file for your environment, see example.

  > NOTE: The file name must match the GitHub environment name.
  >
  > Example: if your environment is `dev`, the file name should be `dev.yml`.
* Make sure all variables in your file are correct.
  * Add your user name to `users`
  * Add domain or IP you would like to use for connecting to kubernetes cluster to `kube_api_sans`
  * For multi-node environment update `workers` section with correct IP addresses
  * If backup server is enabled, update `backup` section with correct IP address
4. Commit your changes.
5. Ensure the **Update workflow environments** Github Action has run successfully. You should see updates to all other GitHub workflows.


Example configuration file (`dev.yml`):

```yaml
all:
  vars:
    # Add IP address for communication with your cluster from your laptop
    # - If you are behind VPN, use private IP address
    # - If your server is exposed (not recommeded), use public IP address
    # - If you would like to run kubectl commands from the remote server, leave this field empty
    kube_api_sans: []
    # Keep default
    ansible_user: provision
    # For development/qa/testing/staging keep true
    # For production keep false
    single_node: true
    users:
      # Add as many users as you wish
      - name: myuser
        ssh_keys:
          - ssh-ed25519 AAAAC3N...cN/5HAjKGbi2DqV7g/Q
        state: present
        # FIXME: https://github.com/opencrvs/opencrvs-core/issues/6267
        # Keep admin for now, feature is not documented
        role: admin
  children:
    master:
      hosts:
        # Update with your real host name
        test-k8s-master:
          ansible_host: localhost
          ansible_connection: local
```

### 2.3 Update OpenCRVS helm chart values

At environment creation phase helm chart values files are stored into `environments/<env name>` folder. Usually default configuration properties are sufficient for first deployment:
- traefik
- dependencies
- opencrvs-services

Commit your changes.

---

## 3. Run Infrastructure Provision

* Trigger the **provision workflow** from your repository.

Verification steps:
* Verify that the Kubernetes self-hosted runner is visible under **Settings → Actions → Runners**.
* You should be able to logic with any user defined under `users` section of inventory file.
* You should have access to kubernetes cluster after login, run command `kubectl config current-context`
* Copy `.kube/config` to your laptop and configure `kubectl` locally instead of remote connection
---

## 4. Run Dependencies Deployment

* Run the **Deploy dependencies**.
* Verify that **MinIO** and **Kibana** are available:
  - Kibana URL: `https://kibana.<your domain>`
  - MinIO URL: `https://minio.<your domain>`
  > NOTE: Credentials are stored at GitHub secrets or can be fetched namespace `opencrvs-deps-<env>`.

---

## 6. Run OpenCRVS Deployment

In this configuration OpenCRVS is deployed with MOSIP integration enabled and Farajaland base image.
Data seed script also executed at the end of deployment workflow.

* Run the **Deploy OpenCRVS** workflow with following properties:
  - Tag of the core image: v1.9.0-beta-1
  - Tag of the countryconfig image: v1.9.0-beta-1
  - Target environment: `<your env>` (dev)
  - Reset environment after deploy: ✅ (checked)
  - Deploy MOSIP integration: ✅ (checked)
4. Verify that the **OpenCRVS login page** is accessible via your configured domain.

---

✅ At this point, OpenCRVS should be successfully deployed on your single-node Kubernetes cluster.

Verification steps:
- Go to login page: `https://<your domain>`
- Login using demo users: https://documentation.opencrvs.org/setup/3.-installation/3.1-set-up-a-development-environment/3.1.4-log-in-to-opencrvs-locally
