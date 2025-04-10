# Reduce number of hardcoded variables


Follow up patterns:
1. Links to services within same namespace should be explicitly listed:
   Examples:
   ```yaml
   - name: APPLICATION_CONFIG_URL
      value: http://config.{{ .Release.Namespace }}.svc.cluster.local:2021
   ```
2. Configuraton to Dependencies (middleware) should go as dedicated variables in helm chart:
   Example: values.yaml
   ```yaml
   elasticsearch_host: elasticsearch.opencrvs-deps-dev.svc.cluster.local:9200

   influxdb:
      host: influxdb-0.influxdb.opencrvs-deps-dev.svc.cluster.local
      port: 8086
      db: ocrvs
   ```
   Take into account variables differ for each environment and for each setup. Google cloud have Mongo and Redis as a service.
3. Inside manifests for particular services mentioning of middleware should be also explicit:
   ```yaml
   - name: ES_HOST
     value: {{ .Values.elasticsearch_host | quote }}
   ```

Few examples of common variables:
COUNTRY_CONFIG_URL
USER_MANAGEMENT_URL
COUNTRY_CONFIG_URL_INTERNAL

Variable with mutations: MONGO_URL


# Publish helm charts

We are starting development, but helm charts already exist and once we setup server environment there will be need to have repository.

# Add github workflows for kubernetes

1. Add workflow for kubernetes deployment
   - github actions
   - helm deployment
2. Add workflow for kubernetes data seed
   - check if it's possible to build post-deploy job for opencrvs-services chart
3. Add workflow for creating users in ELK and mongo
   - check if it's possible to build post-deploy job for dependencies chart

# Monitoring

1. Review option of replacing ELK with something more simple

# SSL

Automatically issue SSL secret for traefix, check possibility to issue valid SSL certificate. Cloud Flare allows to use domain validation for SSL. It is possible to issue valid SSL for dev environment and then use Certificate across all dev environments within local.opencrvs.dev domain.

# Fixes

...

# Data persistence

Kubernetes helm chart doesn't have data persistence in case of uninstall

- https://kubernetes.io/docs/concepts/storage/volumes/#image

# Add minio-mc container

TODO: Check if container is needed

# Add common secret

On github environment we have all secrets stored per environment, We could also store all secrets together in common secret, that will simplify configuration.
