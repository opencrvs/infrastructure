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
| redis | bitnami/redis:latest | 6379 |  |

All services are deployed within the same namespace as StatefulSets with data persistence enabled. By default security is turned off and default password or no-password access is used to access the service. Please check appropriate section for each service for more details.

Any particular service within this helm chart can be disabled by setting `<service_name>.enabled` flag to `false`. E/g Memorystore on Google Cloud Platform is replacement for Redis, instead running Redis container cloud native solution could be used.

## Services

### MongoDB

MongoDB configuration section for Helm values.yaml

This section allows you to configure the deployment of MongoDB within your infrastructure.
| Parameter                | Type    | Default | Description                                                                                                                                                                                                                   |
|--------------------------|---------|----|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| enabled                  | bool    | true | Enable or disable the MongoDB deployment.                                                                                                                                                                                     |
| version                  | string  | 4.4 | Specify the MongoDB Docker image version to use. See: https://hub.docker.com/_/mongo                                         |
| use_default_credentials  | bool    | true | If true, deploys MongoDB without authentication. If false, custom databases and users are created as specified below.                                                                                                         |
| databases                | list    | See values.yaml | List of databases and users to create when authentication is enabled (`use_default_credentials: false`). Each item supports the following fields:                                       |
| databases[].prefix       | string  | -//- | Prefix used to generate environment variable names for the database, user, password, and roles.                                                                                        |
| databases[].db           | string  | -//- |  Name of the MongoDB database to create.                                                                                                                                                |
| databases[].user         | string  | -//- | Name of the MongoDB user to create and assign to the database.                                                                                                                         |
| databases[].roles        | string  | -//- | (Optional) JSON string specifying roles to assign to the user. If not provided, the user is granted the `readWrite` role on the specified database by default. When specifying custom roles, ensure to include `readWrite` or `read` for the database defined at `databases[].db` field.                        |

**Example:**
```yaml
  databases:
    - prefix: APP
      db: app-db
      user: app-user
    - prefix: REPORTS
      db: reports
      user: reports-user
      roles: "[{ role: 'readWrite', db: 'reports' }, { role: 'read', db: 'app-db' }]"
```

In this example:
- The first entry creates a database named `app-db` with a user `app-user` and grants the default `readWrite` role on `app-db`.
- The second entry creates a database named `reports` with a user `reports-user` and assigns custom roles: `readWrite` on `reports` and `read` on `app-db`. Note, roles field must explicitly define access level for both databases.
- The `prefix` field is used to generate environment variable names for each database and user, making it easier to reference credentials in your application configuration.


The generated credentials can be accessed from the `mongo-opencrvs-users` secret.
List of Variables Generated at helm installation time:
  - `<PREFIX>_DB`: Database name
  - `<PREFIX>_MONGODB_USER`: Username
  - `<PREFIX>_MONGODB_PASSWORD`: Randomly generated password
  - `<PREFIX>_MONGODB_ROLES`: Roles in JSON format

Additionally secret `mongodb-urls` with all MongoDB URLs is created. Secret keys are in format 
`<PREFIX>_MONGO_URL` and can be used for OpenCRVS authentication.


> NOTE: 
> Copy secret `mongodb-urls` and from dependencies namespace (`opencrvs-deps-<env>`) to OpenCRVS application namespace (`opencrvs-<env>`) to use them within application for authentication. If you are using GitHub pipelines provided by OpenCRVS for deployment, feel free to skip this step.

Notes:
- 
- The 'roles' field must be a valid JSON string.


### Elasticsearch


This section allows you to configure the deployment and authentication settings for Elasticsearch.

| Key                     | Type     | Example                | Description                                                                                  | 
|-------------------------|----------|----------------------------------------------------------------------------------------------|------------------------|
| enabled                 | boolean  | true                   | Enable or disable the Elasticsearch deployment.                                              |
| use_default_credentials | boolean  | true                   | Deploy Elasticsearch without enabled authentication.                                 |
| auth_users              | list     | See examples below     | List of users to create and grant authorization to Elasticsearch.                            |

#### auth_users Format
Each entry in `auth_users` can be either:
- A placeholder (e.g., `SEARCH`)
- A placeholder and username pair separated by a colon (e.g., `KIBANA_SYSTEM:kibana_system`)

Placeholders are converted to environment variables:
- `<PLACEHOLDER>_ELASTIC_USERNAME`
- `<PLACEHOLDER>_ELASTIC_PASSWORD`

If `<USERNAME>` is not provided, a random username is generated. Passwords are always generated randomly as well.
Credentials are stored in the secret named `elasticsearch-opencrvs-users`.

**Configuration example:**

```yaml
elasticsearch:
  enabled: true
  use_default_credentials: true
  auth_users:
    - SEARCH
    - KIBANA_USER
    - KIBANA_SYSTEM:kibana_system
    - METRICBEAT:beats_system
    - APM:apm_system
```

In this example:
- `SEARCH` and `KIBANA_USER` will have random usernames and passwords generated.
- `KIBANA_SYSTEM`, `METRICBEAT`, and `APM` will use the specified usernames (`kibana_system`, `beats_system`, `apm_system`) with random passwords.

The generated credentials can be accessed from the `elasticsearch-opencrvs-users` secret.

> NOTE: 
> Copy secret `elasticsearch-opencrvs-users` from dependencies namespace (`opencrvs-deps-<env>`) to OpenCRVS application namespace (`opencrvs-<env>`) to use them within application for authentication. If you are using GitHub pipelines provided by OpenCRVS for deployment, feel free to skip this step.

### MinIO

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable minio service |
| use_default_credentials | true | Default credentials for MinIO are username `minioadmin` and password `minioadmin`. |


Setting `use_default_credentials` to `false` will generate strong password for MinIO.

MinIO defaults to minioadmin and minioadmin as the access key and secret key respectively.
MinIO strongly discourages use of the default credentials regardless of deployment environment.
Check official documentation for more details:
https://min.io/docs/minio/linux/administration/identity-access-management/minio-user-management.html

We strongly recommend to set this value as `false` for production.

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


### InfluxDB

### Hearth

### Redis

OpenCRVS is using Bitnami package for Redis https://hub.docker.com/r/bitnami/redis due to better security and performance optimization. Please check there full list of available options

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable redis service |
| env | {} | Flat dictionary (key/value) of environment variables passed to docker container |
| auth_mode | disabled | Authentication mode, possible values `disabled`, `acl` or `password` |


#### Redis authentication

Redis service provides following ways for authentication (`credentials.enabled`):

- `disabled`: Option is preferred for local development. Authentication is disabled. Behind the scenes environment variable `ALLOW_EMPTY_PASSWORD` is set to `yes` inside Redis container, check official documentation for more details.
- `password`: Authentication is performed under one shared account `default`, Environment variable `REDIS_PASSWORD=<random password>` is set inside container and stored as secret `redis-opencrvs-users`.
- `acl`: Option is preferred for production setup. Each OpenCRVS service has it's own username and password. See next section for more details.

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

More details about ACL support can be found at https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/

