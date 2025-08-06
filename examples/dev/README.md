
# General information

This example shows manual deployment on single-node kubernetes cluster. 

After deployment you will get OpenCRVS with Farajaland data populated across databases.

Following components are included into deployment:
- Traefik v3.4.3, official helm chart is used (traefik-36.3.0)
- Datastores, see OpenCRVS dependencies helm chart for exact versions:
  - MongoDB
  - Postgres
  - Elasticsearch
  - Redis
  - MinIO
  - InfluxDB
- Monitoring and Logging, see OpenCRVS dependencies helm chart for exact versions:
  - Kibana
  - Logstash
  - Filebeat
  - Metricbeat
  - Elastic APM server
  - Elastalert2
- OpenCRVS services are deployed with Farajaland data and MOSIP integration enabled:
  - Core packages version: 0f10027
  - Farajaland version: 3314a9a
- MOSIP package

# Deploy with Github

## Prerequisites

1. Fork repository: https://github.com/opencrvs/infrastructure
2. Create GitHub environment
3. Create following GitHub secrets under environment:
   - ENCRYPTION_KEY, `/data` partition encryption key
   - K8S_RUNNER_TOKEN, Kubernetes self-hosted runner secret
4. Create following GitHub environment variables:
   - DISK_SPACE, encrypted partition disk size
   - DOMAIN, domain

## Bootstrap github self-hosted runner

Make sure you have following values:
- github org name (usually repo owner)
- github repository name
- github PAT with access to repository code and workflow
- environment name

Steps
1. Login to VM (server)
2. Create `provision` user with sudo privileges 
3. Run command:
   ```
   curl -s https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/polish-install-process/github-runner/node-runner.sh -o runner.sh && bash runner.sh
   ```
   You should see a message:
   ```
   ✅ Runner '....-runner' is installed and started!
   ```
   In your github repository you should see a self-hosted runner under settings/actions/runners

## Prepare environment file

1. Go to `infrastructure/server-setup/inventory` folder
2. Create file that match with your environment name, e/g if your environment name is `dev` then file name should be `dev.yml`
3. Commit your changes
4. Wait few minutes for update-envs workflow to complete
Configuration file example:
```yaml
all:
  vars:
    kube_api_sans: []
    ansible_ssh_common_args: '-o StrictHostKeyChecking=no'
    ansible_user: provision
    single_node: true
    users:
      - name: vmudryi
        role: 
        ssh_keys:
          - ssh-ed25519 AAAAC3N...cN/5HAjKGbi2DqV7g/Q
        state: present
        role: admin
  children:
    master:
      hosts:
        test-k8s-master:
          ansible_host: 5.78.158.131
```

## Run provision

- Run provision workflow
- Make sure kubernetes self-hosted runner is available at settings/actions/runners

## Run Dependencies deployment workflow

Review file `examples/dev/dependencies/values.yaml` and if needed adjust values, defaults should be good for starting point

- Run Dependencies deployment workflow
- Make sure minio and kibana are available

## Run OpenCRVS deployment workflow

Review file `examples/dev/opencrvs-services/values.yaml` and if needed adjust values, defaults should be good for starting point

- Run OpenCRVS deployment workflow
- Make sure login page is available

# Manual Deployment on existing kubernetes cluster

> NOTE: If you would like to provision infrastructure and kubernetes cluster with ansible scripts developed by OpenCRVS Team, please use [Deploy with Github](#deploy-with-github) scenario. Manual deployment scenario covers only OpenCRVS and dependencies installation.

## Prerequisites
1. VM has public IP, or at least you have option to open ports 80 and 443, otherwise traefik will not be able to issue valid SSL Certificates with lets encrypt http-01 challenge.
2. Valid Domain name is attached to VM. You need to have 2 `A` records:
   - Domain mapping to your IP address
   - Wildcard domain mapped to your IP address

3. Single-node Kubernetes cluster is up and running on your VM.
   Make sure you are able connect to the cluster with kubectl
   ```
   kubectl get nodes
   ```

## Installation process

> ℹ️ All commands should be started from `examples/dev` directory

1. Deploy traefik
   ```
   helm upgrade --install traefik traefik-repo/traefik \
   --namespace traefik \
   --create-namespace \
   -f traefik/values.yaml
   ```
2. Install OpenCRVS dependencies
    > ⚠️ Update `<your_host_name>` placeholder before running command
    ```
    helm upgrade --install opencrvs-deps oci://ghcr.io/opencrvs/opencrvs-dependencies-chart \
    --namespace "opencrvs-deps-dev" \
    -f examples/dev/dependencies/values.yaml \
    --create-namespace \
    --set storage_type=host_path \
    --set hostname=<your_host_name>
    ```
3. Install OpenCRVS MOSIP integration
    > ⚠️ Update `<your_host_name>` placeholder before running command
    ```
    helm upgrade --install mosip-api oci://ghcr.io/opencrvs/opencrvs-mosip \
        --namespace "opencrvs-dev" \
        -f mosip-api/values.yaml \
        --create-namespace \
        --atomic \
        --set hostname=<your_host_name>
    ```
4. Copy secrets from dependencies to main namespace:
   ```
   secrets=(
        "elasticsearch-admin-user"
        "redis-opencrvs-users"
        "minio-opencrvs-users"
        "mongodb-admin-user"
        "postgres-admin-user"
    )
    for secret in "${secrets[@]}"; do
        kubectl get secret $secret -n opencrvs-deps-dev -o yaml \
        | sed "s#namespace: opencrvs-deps-dev#namespace: opencrvs-dev#" \
        | grep -vE 'resourceVersion|uid|creationTimestamp' \
        | kubectl apply -n opencrvs-dev -f - 
    done
   ```
5. Install OpenCRVS
    > ⚠️ Update `<your_host_name>` placeholder before running command
    ```
    helm upgrade --install opencrvs oci://ghcr.io/opencrvs/opencrvs-services \
        --timeout 15m \
        --namespace "opencrvs-dev" \
        -f opencrvs-services/values.yaml \
        --create-namespace \
        --atomic \
        --set hostname=<your_host_name>
    ```
6. Seed data
    ```
    helm get values opencrvs --namespace "opencrvs-dev" \
       | helm template -f - \
            --set data_seed.enabled=true \
            --namespace "opencrvs-dev" \
            -s templates/data-seed-job.yaml \
            oci://ghcr.io/opencrvs/opencrvs-services \
       | kubectl apply --namespace "opencrvs-dev" -f -
    ```
