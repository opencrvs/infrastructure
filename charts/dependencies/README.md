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

All services are deployed within same namespace. By default security is turned off and default password or no-password access is used to access the service. Please check appropriate section for each service for more details.

Any particular service within this helm chart can be disabled by setting `<service_name>.enabled` flag to `false`. E/g Memorystore on Google Cloud Platform is replacement for Redis, instead running Redis container cloud native solution could be used.

## Services

### MongoDB

### Elasticsearch

### InfluxDB

### Hearth

### Redis

OpenCRVS is using Bitnami package for Valkey https://hub.docker.com/r/bitnami/valkey due to better security and performance optimization. Please check there full list of available options

| Key | Default value | Description |
|-|-|-|
| enabled | true | Enable or disable redis service |
| env | {} | Flat dictionary (key/value) of environment variables passed to docker container |
| acl.enabled | false | Enable or disable ACL support |
| acl.users | [] | List of users to be added to ACL |


#### Redis authentication

Redis service provides following ways for authentication:

- Disabled: Set environment variable `ALLOW_EMPTY_PASSWORD=yes`, completely disable authentication, see official documentation for more details.
- One password: Set environment variable `VALKEY_PASSWORD=<some secure password>`, default user password for authentication with full access
- Fine gained: Set `acl.enabled` to `true` and Helm chart will configure everything else. See next section for more details

#### Redis authorization (ACL)

Behind the scenes Set environment variable `VALKEY_ACLFILE=<path to file>`, Access control list authentication and authorization, fine gained way to track access to redis instance.

Recommented 

More details about ACL support can be found at https://valkey.io/topics/acl/

If you need any specific configuration please update [templates/redis-secrets.yaml](templates/redis-secrets.yaml).