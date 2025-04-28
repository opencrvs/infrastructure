# General information

Helm chart does deployment of OpenCRVS dependencies in dedicated namespace.

List of deployed services:

| Service name | Docker image | Default port | Notes |
|---|---|---|---|
| mongodb | mongo:4.4 | 27017 |  |
| minio | 3535 / 3536 |  |
| influxdb | minio/minio:RELEASE.2023-08-16T20-17-30Z.hotfix.a51234923 | influxdb:1.8.10 | 8086 |  |
| elasticsearch | docker.elastic.co/elasticsearch/elasticsearch:8.16.4 | 9200 |  |
| hearth | opencrvs/hearth:1.1.0 | 3447 |  |
| redis | bitnami/valkey:latest | 6379 | NOTE: Valkey is redis drop-in replacement, conforms Open Source and Free Software license. |

All services are deployed within the same namespace as StatefulSets with data persistence enabled. By default security is turned off and default password or no-password access is used to access the service. Please check appropriate section for each service for more details.

Any particular service within this helm chart can be disabled by setting `<service_name>.enabled` flag to `false`. E/g Memorystore on Google Cloud Platform is replacement for Redis, instead running Redis container cloud native solution could be used.

## Services

### MongoDB

### MinIO

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable minio service |
| use_default_credentials | true | Default credentials for MinIO are username `minioadmin` and password `minioadmin`. |


Setting `use_default_credentials` to `false` will generate strong password for MinIO.

Default credentials for MinIO are username `minioadmin` and password `minioadmin`. We strongly recommend to set this value as `false` for production.

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

### Elasticsearch

### InfluxDB

### Hearth

### Redis

OpenCRVS is using Bitnami package for Valkey https://hub.docker.com/r/bitnami/valkey due to better security and performance optimization. Please check there full list of available options

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable redis service |
| env | {} | Flat dictionary (key/value) of environment variables passed to docker container |
| auth_mode | disabled | Authentication mode, possible values `disabled`, `acl` or `password` |


#### Redis authentication

Redis service provides following ways for authentication (`credentials.enabled`):

- `disabled`: Authentication is disabled. Behind the scenes environment variable `ALLOW_EMPTY_PASSWORD` is set to `yes` inside Valkey container, check official documentation for more details.
- `password`: Authentication is performed under one shared account `default`, Environment variable `VALKEY_PASSWORD=<random password>` is set inside container and stored as secret `redis-opencrvs-users`.
- `acl`: Each OpenCRVS service has it's own username and password. See next section for more details.

#### Redis authorization (ACL)

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

More details about ACL support can be found at https://valkey.io/topics/acl/

