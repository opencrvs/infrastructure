# Before you begin

This Example allow you deploy OpenCRVS on your localhost using Docker.

In this example 2 configurations are provided:
- `insecure`, this configuration is suitable for local development and testing, it does not use SSL certificates. this configuration doesn't use authentication between components (Elasticsearch, Minio, etc.). See full list of changes in the following files:
    - [`depencencies/values-dev.yaml`](./dependencies/values-dev.yaml)
    - [`opencrvs-services/values-dev.yaml`](./opencrvs-services/values-dev.yaml)
- `secure`, this configuration uses authentication between components (Elasticsearch, Minio, etc.). See full list of changes in the following files:
    - [`depencencies/values-dev-secure.yaml`](./dependencies/values-dev.yaml)
    - [`opencrvs-services/values-dev-secure.yaml`](./opencrvs-services/values-dev.yaml)

For both configurations SSL certificates are disabled to simplify testing and development process on you local development environment.

