# General information

Helm chart does deployment of OpenCRVS dependencies including monitoring stack. Helm Chart is capable for testing and pilot projects.

> NOTE: See [values.yaml](values.yaml) for exact versions

- Datastores:
  - MongoDB
  - Postgres
  - Elasticsearch
  - Redis
  - MinIO
  - InfluxDB
- Observability (Monitoring and Logging):
  - Kibana
  - Logstash
  - Filebeat
  - Metricbeat
  - Elastic APM server
  - Elastalert2

Datastore services are deployed as StatefulSets with data persistence enabled. By default security is turned off and default password or no-password access is used datastore access. Please check appropriate section for each service for more details.

Monitoring is disabled by default to keep lower resource usage, check [Monitoring](#monitoring) section for more details how to enable monitoring.

Any particular service within this helm chart can be disabled by setting `<service_name>.enabled` flag to `false`. E/g Memorystore on Google Cloud Platform is replacement for Redis, instead running Redis container cloud native solution could be used.

# Services

## Global configuration options

| Parameter                | Type    | Default | Description                                   |
|-|-|-|-|
| hostname| string | farajaland.dev | All chart services will be available under specified domain. Exposed services are MinIO and Kibana, if Monitoring is enabled |
| ingress.ssl_enabled      | bool    | false   | Enable SSL for IngressRoutes. |
| ingress.tls_resolver | string | ` ` | If traefik was deployed with custom resolver, please define resolver name here. Resolver will be attached to Traefik CRD IngressRoute, otherwise default Traefik SSL Certificate will be used. |
| ingress.tls_secret_name | string | ` ` | Custom SSL Certificate for IngressRoute, check traefik documentation for details |
| storage_type | string | pvc | Kubernetes storage type, available options are `pvc` or `host_path`. More information are at [Storage Configuration](#storage-configuration) |
| node_selector | dict | `{}` | Label selector for datastore nodes, usually used to keep data persistent |
| monitoring.enabled | bool | `false` | Enable or disable monitoring, see [Monitoring](#monitoring) |
| backup.enabled | bool | `true` | Enable or disable backup. Please check [Backup configuration](#backup-configuration) for more options |

## MongoDB

MongoDB configuration section for Helm values.yaml

This section allows you to configure the deployment of MongoDB within your infrastructure.
| Parameter                | Type    | Default | Description                                                                                                                                                                                                                   |
|--------------------------|---------|----|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| enabled                  | bool    | true | Enable or disable the MongoDB deployment.                                                                                                                                                                                     |
| version                  | string  | 4.4 | Specify the MongoDB Docker image version to use. See: https://hub.docker.com/_/mongo                                         |
| use_default_credentials  | bool    | true | If true, deploys MongoDB without authentication. If false, custom databases and users are created as specified below.                                                                                                         |
| data_storage_size | string | 1Gi | Persistent volume claim size for MongoDB data volume |
| backup_schedule | string | `n/a` | Backup cronjob schedule, if not defined then values from `backup.schedule` is used |
| backup_server_dir | string | `n/a` | Directory to store encrypted backup on backup server, if not defined `backup.backup_server_dir` is used |

## Postgres

Postgres configuration section for Helm values.yaml

This section allows you to configure the postgres deployment within your infrastructure.
| Parameter                | Type    | Default | Description                                                                                                                                                                                                                   |
|--------------------------|---------|----|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| enabled                  | bool    | true | Enable or disable the Postgres deployment.                                                                                                                                                                                     |
| use_default_credentials  | bool    | true | If true, deploys Postgres with default user/password: postgres/postgres |
| data_storage_size | string | 1Gi | Persistent volume claim size for Postgres data volume |

## Elasticsearch


This section allows you to configure the deployment and authentication settings for Elasticsearch.

| Key                     | Type     | Example                | Description                                                                                  | 
|-------------------------|----------|----------------------------------------------------------------------------------------------|------------------------|
| enabled                 | boolean  | true                   | Enable or disable the Elasticsearch deployment.                                              |
| use_default_credentials | boolean  | true                   | Deploy Elasticsearch without enabled authentication.                                 |
| data_storage_size | string | 5Gi | Persistent volume claim size for Elasticsearch data volume |
| backup_storage_size | string | 1Gi | Persistent volume claim size for Elasticsearch backup volume |
| backup_schedule | string | `n/a` | Backup cronjob schedule, if not defined then values from `backup.schedule` is used |
| backup_server_dir | string | `n/a` | Directory to store encrypted backup on backup server, if not defined `backup.backup_server_dir` is used |

## MinIO

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable minio service |
| use_default_credentials | true | Default credentials for MinIO are username `minioadmin` and password `minioadmin`. |
| data_storage_size | string | 1Gi | Persistent volume claim size for MinIO data volume |
| backup_schedule | string | `n/a` | Backup cronjob schedule, if not defined then values from `backup.schedule` is used |
| backup_server_dir | string | `n/a` | Directory to store encrypted backup on backup server, if not defined `backup.backup_server_dir` is used |

Setting `use_default_credentials` to `false` will generate strong password for MinIO.

MinIO defaults to minioadmin and minioadmin as the access key and secret key respectively.
MinIO strongly discourages use of the default credentials regardless of deployment environment.
Check official documentation for more details:
https://min.io/docs/minio/linux/administration/identity-access-management/minio-user-management.html

Values are stored as a Kubernetes secret `minio-opencrvs-users` in dependencies namespace. Copy secret object as is into OpenCRVS application namespace to make it accessible by services:

```
DEPENDENCIES_NAMESPACE=<dependencies namespace>
OPENCRVS_NAMESPACE=<OpenCRVS namespace>
kubectl get secret minio-opencrvs-users -n $DEPENDENCIES_NAMESPACE -o yaml \
  | sed "s#namespace: $DEPENDENCIES_NAMESPACE#namespace: $OPENCRVS_NAMESPACE#" \
  | kubectl apply -n $OPENCRVS_NAMESPACE -f -
```
Don't forget to replace placeholders with appropriate namespaces.

Example of Kubernetes secret:
```
$ kubectl get secret -oyaml -n opencrvs-dev minio-opencrvs-users | yq .data
MINIO_ACCESS_KEY: RE...wMw==
MINIO_ROOT_PASSWORD: dG...FU=
MINIO_ROOT_USER: RE...wMw==
MINIO_SECRET_KEY: dG...FU=
```

Reference secret values within `values.yaml`:
```yaml
documents:
  secrets:
    minio-secret:
      - MINIO_ACCESS_KEY
      - MINIO_SECRET_KEY
```


## Redis

OpenCRVS is using Bitnami package for Redis https://hub.docker.com/r/bitnami/redis due to better security and performance optimization. Please check there full list of available options

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable redis service |
| env | {} | Flat dictionary (key/value) of environment variables passed to docker container |
| auth_mode | disabled | Authentication mode, possible values `disabled`, `acl` or `password` |


### Redis authentication

Redis service provides following ways for authentication (`credentials.enabled`):

- `disabled`: Option is preferred for local development. Authentication is disabled. Behind the scenes environment variable `ALLOW_EMPTY_PASSWORD` is set to `yes` inside Redis container, check official documentation for more details.
- `password`: Authentication is performed under one shared account `default`, Environment variable `REDIS_PASSWORD=<random password>` is set inside container and stored as secret `redis-opencrvs-users`.
- `acl`: Option is preferred for production setup. Each OpenCRVS service has it's own username and password. See next section for more details.

### Redis authorization (ACL)

Behind the scenes helm chart generates random username and password for each OpenCRVS service:
- auth
- gateway
- webhooks
- workflow

Values are stored as a Kubernetes secret `redis-opencrvs-users` in dependencies namespace. Copy secret object as is into OpenCRVS application namespace to make it available:

```
DEPENDENCIES_NAMESPACE=<dependencies namespace>
OPENCRVS_NAMESPACE=<OpenCRVS namespace>
kubectl get secret redis-opencrvs-users -n $DEPENDENCIES_NAMESPACE -o yaml \
  | sed "s#namespace: $DEPENDENCIES_NAMESPACE#namespace: $OPENCRVS_NAMESPACE#" \
  | kubectl apply -n $OPENCRVS_NAMESPACE -f -
```
Don't forget to replace placeholders with appropriate namespaces.

Example of Kubernetes secret:
```
$ kubectl get secret -oyaml -n opencrvs-dev redis-opencrvs-users | yq .data
AUTH_REDIS_PASSWORD: cENqNVZ...52T2xqY01ubG4=
AUTH_REDIS_USERNAME: T09MWV...0azgweg==
DEFAULT_REDIS_PASSWORD: TmpkbE...BM3UzeHE=
GATEWAY_REDIS_PASSWORD: UU94M...ZmlGdHc=
GATEWAY_REDIS_USERNAME: UTJOW...BwcGFSeA==
WEBHOOKS_REDIS_PASSWORD: Um...OYXc=
WEBHOOKS_REDIS_USERNAME: ajJB...RFbQ==
WORKFLOW_REDIS_PASSWORD: U1ZB...xRWUR2R0Q=
WORKFLOW_REDIS_USERNAME: V0s...Mw==
```

Reference secret values within `values.yaml`:
```yaml
# auth example:
auth:
  secrets:
    redis-opencrvs-users:
      - AUTH_REDIS_PASSWORD:REDIS_PASSWORD
      - AUTH_REDIS_USERNAME:REDIS_USERNAME
```

If you need any specific configuration for ACL (read-only, command limit, etc) please update [templates/redis-secrets.yaml](templates/redis-secrets.yaml).

More details about ACL support can be found at https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/

## InfluxDB

| Key                     | Type     | Example                | Description                                                                                  | 
|-------------------------|----------|----------------------------------------------------------------------------------------------|------------------------|
| enabled                 | boolean  | true                   | Enable or disable the Elasticsearch deployment.                                              |
| data_storage_size | string | 5Gi | Persistent volume claim size for InfluxDB data volume |
| backup_storage_size | string | 1Gi | Persistent volume claim size for InfluxDB backup volume |

## Storage Configuration

This chart supports flexible data persistence for **Elasticsearch, MongoDB, Postgres, MinIO, and InfluxDB**.  
You control persistence using the `storage_type` option, which can be set **globally** (`storage_type`) or per datastore (e.g. `elasticsearch.storage_type`).


- **`storage_type`**, available options:
  - **`pvc`** – Use the default Kubernetes StorageClass to create a PersistentVolumeClaim.
  - **`host_path`** – Use a directory on the Kubernetes node for persistence. The directory must be created with the appropriate permissions. This option is the default for legacy VMs running Docker Swarm that have been migrated to Kubernetes.
- **`data_storage_size` / `backup_storage_size`** – Define the size of the PVC claim per datastore/service. Please check the Values file for supported keys.
- **`host_data_path` / `host_backup_path`** – Optionally specify data and backup paths per datastore/service. For example, Elasticsearch supports the `host_data_path` and `host_backup_path` properties to specify where data and backups should be stored. If the directory does not exist, it will be created during deployment.
- **`node_selector`** – Use a node selector to control where the pod is scheduled. This option can be defined globally or per service.

---

### Configuration Examples

#### Use PVC (cloud deployments, managed clusters, etc):
```yaml
elasticsearch:
  # storage_type: pvc  # Not required; pvc is default
  data_storage_size: 5Gi
  backup_storage_size: 1Gi
  storage_class_name: ""  # Optional: specify a StorageClass or leave as "" for default
```

#### Use hostPath for Elasticsearch data and backups (legacy volumes, on-prem, etc):
```yaml
elasticsearch:
  storage_type: host_path
  host_data_path: /data/elasticsearch  # default value
  host_backup_path: /data/backups/elasticsearch  # default value
```

---

### FAQ

**Q:** What happens if I set both the global and Elasticsearch-level `storage_type`?  
**A:** The value for `elasticsearch.storage_type` takes precedence for Elasticsearch.

**Q:** What if I use `host_path` on a multi-node cluster?  
**A:** Only the node(s) with the specified host directories will be able to run the datastore pod. Use `node_selector` to control exactly which node the service is scheduled on.



## Monitoring

Helm chart has built-in Observability components configured to work with OpenCRVS and collect key metrics.

Following tools are included in monitoring suite:
- Kibana
- Elastalert2
- Filebeat
- Metricbeat
- Logstash
- APM server

> NOTE: Before enabling monitoring tools make sure Elasticsearch default credentials are disabled:
```yaml
elasticsearch:
  use_default_credentials: false
```

## Backup configuration

Dependencies chart has built-in backup tool for it's internal components and requires external backup server to store backed up files.

Reference available options:

| Parameter                | Type    | Default | Description                                   |
|-|-|-|-|
| enabled | bool | `false` | Enable or disable backup |
| schedule | string | `0 1 * * *` | Cronjob schedule |
| backup_server_secret | string | `backup-server-ssh-credentials` | Secret name with credentials for backup server |
| backup_server_dir | string | `n/a` | Backup server remote directory |
| backup_encryption_secret | string | `backup-encryption-secret` | Secret to store backup encryption key |


Backup server connection properties needs to be stored as a kubernetes secret, secret needs to be created before enabling backup:
- `ssh_key`, ssh private key for remote login to backup server, key should be create on backup server and private part stored in secure place
- `user`, ssh username to login on backup server, user should have read/write access to backup folder, we strongly recommend don't enable `sudo` or other way of admin access.
- `host`, backup server IP address or hostname.

Recommended way to create `backup-server-ssh-credentials` secret:
```
kubectl create secret backup-server-ssh-credentials
    --from-literal=user=your-ssh-username \
    --from-literal=host=your.ssh.host.com \
    --from-file=ssh_key=backup_id_rsa
```

If you are using GitHub workflow from OpenCRVS, secret will be created automatically in `opencrvs-deps-<your environment>` namespace.

Recommended way to create `backup-encryption-secret` secret:
```
kubectl create secret backup-encryption-secret
    --from-literal=backup_encryption_key=your-encryption-key
```