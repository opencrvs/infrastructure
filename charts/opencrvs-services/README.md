# 🚧 Work in Progress

# General documentation

Helm chart to deploy all OpenCRVS services on Kubernetes cluster.

# Dependencies Configuration

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Default</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>elasticsearch_host</td>
            <td>elasticsearch.opencrvs-deps-dev.svc.cluster.local:9200</td>
            <td>Elasticsearch configuration, including the hostname and port.<br> <b>NOTE</b>: Some services require authentication, please use secrets to redefine ES_HOST variable if needed.</td>
        </tr>
        <tr>
            <td>influxdb.host</td>
            <td>influxdb-0.influxdb.opencrvs-deps-dev.svc.cluster.local</td>
            <td>InfluxDB hostname configuration.</td>
        </tr>
        <tr>
            <td>influxdb.port</td>
            <td>8086</td>
            <td>InfluxDB port configuration.</td>
        </tr>
        <tr>
            <td>influxdb.db</td>
            <td>ocrvs</td>
            <td>InfluxDB database name.</td>
        </tr>
        <tr>
            <td>fhir_url</td>
            <td>http://hearth.opencrvs-deps-dev.svc.cluster.local:3447/fhir</td>
            <td>FHIR URL Endpoint. TODO: Add description for FHIR URL configuration.</td>
        </tr>
        <tr>
            <td>minio.host</td>
            <td>minio-0.minio.opencrvs-deps-dev.svc.cluster.local</td>
            <td>MinIO hostname configuration.</td>
        </tr>
        <tr>
            <td>minio.port</td>
            <td>3535</td>
            <td>MinIO port configuration.</td>
        </tr>
        <tr>
            <td>mongodb_host</td>
            <td>mongodb-0.mongodb.opencrvs-deps-dev.svc.cluster.local</td>
            <td>MongoDB hostname configuration.</td>
        </tr>
        <tr>
            <td>redis_host</td>
            <td>redis-0.redis.opencrvs-deps-dev.svc.cluster.local</td>
            <td>Redis hostname configuration.</td>
        </tr>
        <tr>
            <td>hostname</td>
            <td>farajaland.com</td>
            <td>Hostname for OpenCRVS application, without wildcard or subdomain. Example: hostname: opencrvs.localhost</td>
        </tr>
        <tr>
            <td>dev_mode</td>
            <td>false</td>
            <td>Developer mode flag. TODO: Check the usage and purpose of this variable.</td>
        </tr>
        <tr>
            <td>env</td>
            <td>{}</td>
            <td>Global environment variables, each variable defined here is available to all workloads (service) deployed by helm chart. See example at [values.yaml](values.yaml)</td>
        </tr>
        <tr>
            <td>&ltservice_name&gt.env</td>
            <td>{}</td>
            <td>Service level environment variables, each variable defined here is available to particular workload (service) only. See example for `config` microservice at [values.yaml](values.yaml)</td>
        </tr>
        <tr>
            <td>&ltservice_name&gt.secrets</td>
            <td>{}</td>
            <td>Mapping kubernetes secrets as environment variables. For more information see [Mapping secrets](#mapping-secrets)</td>
        </tr>
        <tr>
            <td>data_seeder.enabled</td>
            <td>true</td>
            <td>Seed data as post-install step, data seeder is executed only once while `helm install`. In some cases when data is already seeded, e/g upgrade, this value must be set to false. **Note**: default user is used for data seeding, it will fail anyway on database with non-default data.</td>
        </tr>
    </tbody>
</table>


# Mapping secrets

Mapping needs to be added for particular service to access variable inside workload (service), e/g for `search` service to access ES_HOST following configuration is needed:
```
search:
    secrets:
        elasticsearch-secret:
            - ES_HOST
```

In some cases variable name (key) stored in kubernetes secret doesn't match with environment variable
```
secrets:
  <secret_name>:
     - <secret_key>:<environment_variable>
```
Summary:
- `secret_name`, name of Kubernetes secret object
- `secret_key`, key (variable name) inside Kubernetes secret data property
- `environment_variable`, environment variable name inside container. If `secret_key` value `environment_variable` are the same, last one can be omitted.

**Step by step example**

Suppose we need to store ES_HOST variable as a secret and provide variable value to service `search`.

1. Create `.env` like file and put all variables:
    ```
    ES_HOST=user:randompass@elasticsearch:9200
    ```
2. Create kubernetes secret from `.env` file:
    ```
    kubectl create secret generic elasticsearch-secret --from-env-file=.env
    ```
3. Make sure the secret was created:
    ```
    kubectl get secret -oyaml elasticsearch-secret
    ```
    Example output:
    ```yaml
    apiVersion: v1
    data:
        ES_HOST: dXNlcjpyYW5kb21wYXNzQGVsYXN0aWNzZWFyY2g6OTIwMA==
    ...
    ```
3. Map variable in your helm chart values file:
    ```yaml
    search:
        secrets:
            elasticsearch-secret:
                - ES_HOST
    ...
    ```
4. Redeploy service with `helm upgrade`
