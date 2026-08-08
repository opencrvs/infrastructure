# Manual Helm Deployment of OpenCRVS on Azure Kubernetes Service

This guide describes how to deploy OpenCRVS on AKS without GitHub Actions, Azure Pipelines, or any other CI/CD system.

The deployment is performed manually using `helm install` / `helm upgrade`.

## Scope

This guide covers:

1. Installing Traefik as the ingress controller
2. Installing OpenCRVS dependencies
3. Using Azure Database for PostgreSQL
4. Using Azure Cache for Redis
5. Installing OpenCRVS using Helm

This guide does not cover:

- GitHub Actions workflows
- Automated CI/CD
- Building custom Docker images
- Infrastructure provisioning with Terraform or Ansible

## Prerequisites

Required tools:

```bash
az
kubectl
helm
````

Required Azure resources:

* AKS cluster
* Azure Database for PostgreSQL
* Azure Cache for Redis
* Public IP address for Traefik
* DNS zone or manually managed DNS records
* TLS certificate strategy:

  * cert-manager with ACME HTTP-01, or
  * manually created TLS secrets

## 1. Connect to AKS

```bash
az aks get-credentials \
  --resource-group <resource-group> \
  --name <aks-cluster-name>
```

Check access:

```bash
kubectl get nodes
```

## 2. Create namespaces

```bash
kubectl create namespace traefik
kubectl create namespace opencrvs
kubectl create namespace opencrvs-deps
```

## 3. Install Traefik

Example:

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update

helm upgrade --install traefik traefik/traefik \
  --namespace traefik \
  --values traefik-values.yaml
```

Example `traefik-values.yaml`:

```yaml
namespaceOverride: traefik

providers:
  kubernetesCRD:
    enabled: true
  kubernetesIngress:
    enabled: false
  kubernetesGateway:
    enabled: false

service:
  enabled: true
  type: LoadBalancer
  annotations:
    service.beta.kubernetes.io/azure-pip-name: <public-ip-name>
    service.beta.kubernetes.io/azure-load-balancer-resource-group: <public-ip-resource-group>

ports:
  web:
    port: 8000
    exposedPort: 80
  websecure:
    port: 8443
    exposedPort: 443
```

Azure supports assigning a static public IP to a Kubernetes `LoadBalancer` service using annotations such as `azure-pip-name` or `azure-load-balancer-ipv4`. If the IP is outside the AKS node resource group, the AKS identity also needs permission to use it. ([Microsoft Learn][1])

Check Traefik:

```bash
kubectl get svc -n traefik
```

## 4. Configure DNS

Create DNS records pointing to the Traefik public IP.

Option A — wildcard DNS:

```text
*.dev.example.com -> <traefik-public-ip>
```

Option B — explicit records:

```text
auth.dev.example.com
gateway.dev.example.com
register.dev.example.com
login.dev.example.com
...
```

## 5. Prepare external Azure services

### PostgreSQL

Create user with admin credentials.

Credentials need to be taken from Azure Database for PostgreSQL instance, Use secret specification:
https://github.com/opencrvs/opencrvs-helm-charts/tree/develop/charts/opencrvs-services#postgres-secrets

Store connection details securely in secret:

```bash
kubectl create secret generic postgres-admin-user \
  --namespace opencrvs \
  --from-literal=POSTGRES_USER="<user>" \
  --from-literal=POSTGRES_PASSWORD="<password>"
```

Define PostgreSQL database in configuration file (`environemnts/<env>/opencrvs-services/values.yaml`):
```yaml
postgres:
  auth_mode: auto
  host: <define postgres host/endpoint here>
  port: <define postgres port here>
  admin_user_secret_name: postgres-admin-user
```

### Redis

Use secret specification: https://github.com/opencrvs/opencrvs-helm-charts/tree/develop/charts/opencrvs-services#redis-secret-redisusers_secret

Create Redis secret:

```bash
# TODO
```

Define Azure Redis in configuration file (`environemnts/<env>/opencrvs-services/values.yaml`):
```yaml
redis:
  auth_mode: use_secret
  users_secret: redis-opencrvs-users
  host: <define redis host/endpoint here>
  port: <define redis port here>
```


## 6. Install OpenCRVS dependencies

Since PostgreSQL and Redis are provided by Azure, disable bundled PostgreSQL and Redis in the dependencies chart.

```bash
helm upgrade --install opencrvs-deps ./opencrvs-dependencies-chart \
  --namespace opencrvs-deps \
  --values dependencies-values.yaml
```

Example `dependencies-values.yaml`:

```yaml
postgresql:
  enabled: false

redis:
  enabled: false

mongodb:
  enabled: true
  use_default_credentials: false

minio:
  enabled: true
  use_default_credentials: false

elasticsearch:
  enabled: true
  use_default_credentials: false
```

## 7. Install OpenCRVS

```bash
helm upgrade --install opencrvs ./opencrvs-chart \
  --namespace opencrvs \
  --values opencrvs-values.yaml
```

Example `opencrvs-values.yaml`:

```yaml
hostname: dev.example.com

platform:
  image:
    registry: ghcr.io
    repository: opencrvs
    tag: v2.0.0

# All OpenCRVS services will be available under domain:
# hostname: opencrvs.localhost

# Access OpenCRVS services at http://opencrvs.localhost
# If SSL is enabled, You need to accept SSL Certificate on localhost for multiple endpoints:
# - login
# - register
# - countryconfig
# - config
# - client
# - ...
# That makes it easier to test the application locally without SSL
# On local environment SSL is disabled by default:
ingress:
  ssl_enabled: false

# On local environment services are exposed at NodePort as well and are available from Tilt
# To access service you need to click on the service name in Tilt UI:
service_type: NodePort

# Horizontal Pod Autoscaler (HPA) configuration:
# Disabled by default for local environment.
hpa:
  enabled: false

# Pod Disruption Budget (PDB) configuration:
# Disabled by default for local environment.
pdb:
  enabled: false

elasticsearch:
  auth_mode: auto
  # Copy  elasticsearch-admin-user from opencrvs-deps-qa namespace into opencrvs-qa namespace
  host: elasticsearch.opencrvs-deps-qa.svc.cluster.local
  admin_user_secret_name: elasticsearch-admin-user

# With Azure Storage we need to create secret minio-opencrvs-users
# https://github.com/opencrvs/opencrvs-helm-charts/tree/develop/charts/opencrvs-services#minio-secret-miniousers_secret
minio:
  auth_mode: use_secret
  # Copy minio-opencrvs-users from opencrvs-deps-qa namespace into opencrvs-qa namespace
  host: minio-0.minio.opencrvs-deps-qa.svc.cluster.local
  users_secret: minio-opencrvs-users

mongodb:
  auth_mode: auto
  # Copy mongodb-admin-user from opencrvs-deps-qa namespace into opencrvs-qa namespace
  admin_user_secret_name: mongodb-admin-user
  host: mongodb-0.mongodb.opencrvs-deps-qa.svc.cluster.local

redis:
  auth_mode: use_secret
  # Create redis-opencrvs-users secret in opencrvs-qa namespace with Redis credentials
  # Credentials need to be taken fro Azure Cache for Redis instance
  # Use secret specification: https://github.com/opencrvs/opencrvs-helm-charts/tree/develop/charts/opencrvs-services#redis-secret-redisusers_secret
  users_secret: redis-opencrvs-users
  host: <define redis host/endpoint here>
  port: <define redis port here>

postgres:
  auth_mode: auto
  host: <define postgres host/endpoint here>
  port: <define postgres port here>
  # Create postgres-admin-user secret in opencrvs-qa namespace with Postgres credentials
  # Credentials need to be taken from Azure Database for PostgreSQL instance
  # Use secret specification:
  # https://github.com/opencrvs/opencrvs-helm-charts/tree/develop/charts/opencrvs-services#postgres-secrets

image:
  tag: v2.0.0

countryconfig:
  image:
    repository: <your dockerhub account>/<image name>
    tag: <image tag>

```

## 8. Validate installation

```bash
kubectl get pods -n opencrvs
kubectl get pods -n opencrvs-deps
kubectl get ingressroute -A
kubectl logs -n traefik deploy/traefik
```

Check application endpoints:

```bash
curl -I https://gateway.dev.example.com
curl -I https://auth.dev.example.com
```

## 9. Upgrade

```bash
helm upgrade opencrvs ./opencrvs-chart \
  --namespace opencrvs \
  --values opencrvs-values.yaml
```

## 10. Rollback

```bash
helm history opencrvs -n opencrvs
helm rollback opencrvs <revision> -n opencrvs
```