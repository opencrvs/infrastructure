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
        <tr>
            <td>hpa.enabled</td>
            <td>true</td>
            <td>Enable Horizontal Pod Autoscaler (HPA) configuration. Configuration is available per service as well, add <pre>&ltservice_name&gt.hpa.&ltkey&gt</pre></td>
        </tr>
        <tr>
            <td>hpa.minReplicas</td>
            <td>1</td>
            <td>Minimal number of PODs per Kubernetes Deployment</td>
        </tr>
        <tr>
            <td>hpa.maxReplicas</td>
            <td>2</td>
            <td>Maximum number of PODs per ReplicaSet</td>
        </tr>
        <tr>
            <td>hpa.averageUtilization</td>
            <td>75</td>
            <td>Average CPU Utilization for autoscaler event (percentage)</td>
        </tr>
        <tr>
            <td>pdb.enabled</td>
            <td>true</td>
            <td>Enable Pod Disruption Budget (PDB) configuration. Configuration is available per service as well, add <pre>&ltservice_name&gt.pdb.&ltkey&gt</td>
        </tr>
        <tr>
            <td>pdb.minAvailable</td>
            <td>50%</td>
            <td>Number of PODs not available while deployment within ReplicaSet</td>
        </tr>
        <tr>
            <td>resources</td>
            <td>{}</td>
            <td>Resources allocated to OpenCRVS microservices (Kubernetes PODs). Properties in this section could be defined per microservice as well.</td>
        </tr>
        <tr>
            <td>resources.memoryRequest</td>
            <td>{}</td>
            <td>Memory requests defined per POD</td>
        </tr>
        <tr>
            <td>resources.memoryLimit</td>
            <td>{}</td>
            <td>Memory limits defined per POD</td>
        </tr>
        <tr>
            <td>resources.cpuRequest</td>
            <td>{}</td>
            <td>CPU requests defined per POD</td>
        </tr>
        <tr>
            <td>resources.cpuLimit</td>
            <td>{}</td>
            <td>CPU limits defined per POD</td>
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

**Manually mapping secrets**

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

# Data maintenance jobs

## Backup

TODO

## Restore

TODO

## Seed environment data


Data seed is part of helm post-install process, but needs to be manually enabled before first deployment by setting flag at environment values file:
```yaml
data_seed:
  enabled: true
```

Helm allows to render and run particular data seed template by running following command:
```
helm template -f <path to environment values file> \
    --set data_seed.enabled=true \
    -s templates/data-seed-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -
```

As a result of execution data seed job will be created.

Use kubectl to check logs:
```
kubectl logs job/data-seed -f
```

## Migration

Data migration is executed as part of post-deployment steps by Helm, however sometimes it's needed to execute data migration manually.

Helm allows to render and run particular data migration template by running following command:
```
helm template -f <path to environment values file> \
    -s templates/data-migration-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -
```

As a result of execution migration job will be created.

Use kubectl to check logs:
```
kubectl logs job/data-migration -f
```

## Cleanup environment


Environment cleanup is distractive operation and should not be started on production. Data cleanup job is a part of OpenCRVS helm chart, but is not included into helm install/upgrade pre/post deployment hooks.

Helm allows to render and run particular data cleanup template by running following command:
```
helm template -f <path to environment values file> \
    --set data_cleanup.enabled=true \
    -s templates/data-cleanup-job.yaml \
    oci://ghcr.io/opencrvs/opencrvs-services | kubectl apply -f -
```

As a result of execution data cleanup job will be created.

Use kubectl to check logs:
```
kubectl logs job/data-cleanup -f --all-containers=true
```
