
# 🚧 Work in Progress

Please note that not all features from the Docker Swarm solution are supported yet and not all pipelines are implemented

---

# General Information

This repository is used to store infrastructure code for deploying OpenCRVS.

---

# Developing OpenCRVS with Kubernetes

Kubernetes is the easiest option to run OpenCRVS locally on your PC or Laptop and test all features and functionality.
Before running make sure all hardware and software requirements are met.

Once you make sure your development environment is ready for running OpenCRVS we are recommending you start from "For OpenCRVS DevOps" configuration and get familiar with all tools used to deploy OpenCRVS locally (tilt, kubectl, helm). In that particular configuration all docker images are pulled from our registry and OpenCRVS application is starting with Falajaland demo data. No additional actions are needed from your side.

## Prerequisites

### Hardware requirements
- 16G RAM
- 8 CPU (at least Intel 8th generation)
- 100G free storage space

### Software requirements

| Tool       | Description |
| ---------- | ----------- |
| Docker     | Docker engine and command-line tool for building images. [Learn more](https://www.docker.com/)|
| Kubernetes | For macOS and Windows users, we recommend Docker Desktop with Kubernetes; for Linux users, we recommend Minikube. More information about setting up Kubernetes can be found in the [Docker engine with Kubernetes cluster](#docker-engine-with-kubernetes-cluster) section. |
| Git        | Git command-line tool for checking out code. [Download Git](https://git-scm.com/downloads). |
| kubectl    | Kubernetes command-line tool. [Documentation](https://kubernetes.io/docs/tasks/tools/). |
| helm       | Helm, a template engine for managing Kubernetes manifests. [Learn more](https://helm.sh/). |
| tilt       | Tilt for live development of Kubernetes applications. [Learn more](https://tilt.dev/). |

---

**NOTE:**
- This guide does not cover the installation of these prerequisites.
- OpenCRVS team has limited capacity to test different configurations. Feel free to submit an issue on GitHub if something doesn't work in your hardware or software setup.

---

### Docker engine with Kubernetes cluster

#### Docker Desktop (with Kubernetes enabled)

Docker desktop with Kubernetes enabled is recommended for development environment on MacOS and Windows. Get more details how to install docker desktop on official website https://www.docker.com/products/docker-desktop/.

Additional configuration for Docker desktop:
  - Enable host networking to be able access http://opencrvs.localhost, otherwise you will need to configure additional tools like proxy.
  - Enable Kubernetes and configure kubectl with correct context
  - Ensure docker-desktop is configured to use at least 12G or more RAM
  - Ensure Storage is set up at least 100G

#### Minikube

Minikube (with docker driver) is recommended way to run Kubernetes on linux. However docker engine is still required for Tilt. Please check official documentation on https://minikube.sigs.k8s.io/docs/.

**NOTE**: 
- Docker support is still experimental for minikube, but it gives better performance in comparison to alternative solutions.


Additional settings for linux (Ubuntu) users:
  - Add following values to /etc/sysctl.conf:
    ```
    fs.inotify.max_user_watches = 524288
    fs.inotify.max_user_instances = 512
    ```
  - Start minikube with unlimited amount of memory:
    ```
    minikube start --memory=no-limits
    ```
  - Start load balancer (tunnel) on localhost:
    ```
    minikube tunnel -c --bind-address='127.0.0.1'
    ```

---

**NOTE:** Any other Kubernetes solution for desktop should work as well. Please check to LoadBalancer and kubernetes services setup if you are not able to access service.

---

# Running OpenCRVS locally

The OpenCRVS team uses [Tilt](https://tilt.dev/) to manage the local development environment. Depending on your role and development needs, the following configurations (Tiltfiles) are available:


- [DevOps developers](#for-opencrvs-devops), This basic configuration is designed for Helm chart development. Tilt uses official OpenCRVS release images along with the Farajaland demo data. Docker images are pulled from the OpenCRVS container registry.
- [Country config developers](#for-opencrvs-country-config-developers), In this setup, OpenCRVS Core images are pulled from the OpenCRVS container registry. The Country Config image is built locally using Tilt's live update feature, so your code changes are reflected almost immediately. Typically, you’ll be working with your own fork of the Country Config repository.
- [Core developers](#for-opencrvs-core-developers), This configuration builds OpenCRVS Core images locally with live updates enabled, allowing near-instant reflection of code changes. By default, the Country Config image is pulled from the OpenCRVS container registry. If you maintain your own fork of the Country Config repository and container registry, you should update the Tiltfile to use your own registry.


## For OpenCRVS DevOps

1. Clone this repository:
   ```
   git clone https://github.com/opencrvs/infrastructure.git
   ```
2. Run:
   ```
   tilt up
   ```
3. Navigate to [http://localhost:10350/](http://localhost:10350/)
4. Run [Data seed](#initial-data-seeding-with-tilt) resource
5. Once all container images are up and running your environment will be available at http://opencrvs.localhost


## For OpenCRVS Country Config Developers

Please follow official documentation how to setup your own country configuration at [Set-up your own, local, country configuration](https://documentation.opencrvs.org/setup/3.-installation/3.2-set-up-your-own-country-configuration).
You need to fork (clone) the [opencrvs-countryconfig](https://github.com/opencrvs/opencrvs-countryconfig) repository and clone the [infrastructure](https://github.com/opencrvs/infrastructure) repository. If repositories are already on your laptop, ensure they are in the same parent folder, for example:
```
repositories/
    infrastructure
    opencrvs-countryconfig
    ...
```

**Step by step instruction**

1. Create a new folder or use an existing folder to store the repositories. For example folder could be located at your home directory or in documents:
   ```bash
   mkdir ~/Documents/repository
   ```
2. Open a terminal (command line) and navigate to the folder.
   ```bash
   cd ~/Documents/repository
   ```
3. Clone OpenCRVS Country Config repository:
    
    For county config use:
    ```bash
    git clone https://github.com/opencrvs/opencrvs-countryconfig
    ```
    For your own fork use:
    ```bash
    git clone git@github.com:<your-github-account>/<your-repository>.git
    ```
4. Clone the Infrastructure repository:
    ```bash
    git clone git@github.com:opencrvs/infrastructure.git
    ```
    **NOTE:** This step is optional, tilt should be able to checkout infrastructure directory
5. Change directory to country config (your own) repository:
    
    For county config use:
    ```bash
    cd opencrvs-countryconfig
    ```
    For your own fork use:
    ```bash
    cd <your-repository>
    ```
7. Run Tilt:
    ```bash
    tilt up
    ```
8. Navigate to [http://localhost:10350/](http://localhost:10350/)
9. Run [Data seed](#initial-data-seeding-with-tilt) resource.
10. Once all container images are up and running your environment will be available at http://opencrvs.localhost


## For OpenCRVS Core Developers

You need to clone the [opencrvs-core](https://github.com/opencrvs/opencrvs-core) and [infrastructure](https://github.com/opencrvs/infrastructure) repositories. If these repositories are already on your laptop, ensure they are in the same folder.

1. Create a new folder or use an existing folder to store the repositories.
2. Open a terminal (command line) and navigate to the folder.
3. Clone the OpenCRVS Core repository:
    ```bash
    git clone git@github.com:opencrvs/opencrvs-core.git
    ```
4. Clone the Infrastructure repository:
    ```bash
    git clone git@github.com:opencrvs/infrastructure.git
    ```
    **NOTE:** This step is optional, tilt should be able to checkout infrastructure directory
5. Change directory to the OpenCRVS Core repository:
    ```bash
    cd opencrvs-core
    ```
6. Run Tilt:
    ```bash
    tilt up
    ```
7. Navigate to [http://localhost:10350/](http://localhost:10350/)
8. Run [Data seed](#initial-data-seeding-with-tilt) resource.
9. Once all container images are up and running your environment will be available at http://opencrvs.localhost

---

## Initial data seeding with tilt

This task should run only once on fresh environment after environment installation.

1. Navigate to [http://localhost:10350/](http://localhost:10350/)
2. Scroll to section `2.Data-tasks` and find resource `Reset database`
3. Run resource using reload button
   ![](doc/images/seed-data.png)
4. Once data seeding completed you will be able to login using default credentials, see [4.1.4 Log in to OpenCRVS locally](https://documentation.opencrvs.org/setup/3.-installation/3.1-set-up-a-development-environment/3.1.4-log-in-to-opencrvs-locally)

## Reset database and Seed data with tilt

1. Navigate to [http://localhost:10350/](http://localhost:10350/)
2. Scroll to section `2.Data-tasks` and find resource `Reset database`
3. Run resource using reload button
   ![](doc/images/reset-data.png)
4. Once data reset completed you will be able to login using default credentials, see [4.1.4 Log in to OpenCRVS locally](https://documentation.opencrvs.org/setup/3.-installation/3.1-set-up-a-development-environment/3.1.4-log-in-to-opencrvs-locally).

## Common issues

### Your session has expired. Please login again.

This issue often appear on local development environment.
Easiest way to solve the issue:
```
kubectl delete pod --all -n opencrvs-dev
```

### Container start is failing with ImagePullBackOff

Check image tag was set properly, use `kubectl`, adjust value in `kubernetes/opencrvs-services/values-dev.yaml`
- Usually for repository your are working tag is `local`, e/g country config repository should have `local` tag only for countryconfig.
- Check tag exists on docker hub (or any other repository)

### Reset local environment

Draft and working way is to restart docker desktop

### Troubleshooting connectivity inside Kubernetes cluster

1. Issue fresh token:

  ```bash
  USERNAME=o.admin
  SUPER_USER_PASSWORD=password
  curl -X POST "http://auth.opencrvs-dev.svc.cluster.local:4040/authenticate-super-user" \
      -H "Content-Type: application/json" \
      -d '{
        "username": "'"${USERNAME}"'",
        "password": "'"$SUPER_USER_PASSWORD"'"
      }'
  ```

2. Check gateway host:
  ```bash
    GATEWAY_HOST=http://gateway.opencrvs-dev.svc.cluster.local:7070
    curl -X GET \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${token}" \
        ${GATEWAY_HOST}/locations?type=ADMIN_STRUCTURE&_count=0
  ```
3. Check config host:
  ```bash
  curl -v -X GET \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${token}" \
      http://config.opencrvs-dev.svc.cluster.local:2021/locations?type=ADMIN_STRUCTURE&_count=0
  ```
4. Check Hearth:
  ```bash
  curl -v http://hearth.opencrvs-deps-dev.svc.cluster.local:3447/fhir/Location
  ```

### Login/Client service is not responding: Check login logs
```
2025/03/19 07:53:38 [error] 15#15: *1 upstream timed out (110: Connection timed out) while connecting to upstream, client: 10.1.3.102, server: localhost, request: "GET /api/countryconfig/login-config.js HTTP/1.1", upstream: "http://10.100.14.175:3040/login-config.js", host: "login.opencrvs.localhost", referrer: "https://login.opencrvs.localhost/"
```

Solution: restart nginx inside login container or delete login pod
```
nginx -s reload
```

**NOTE:** On AWS server may not respond due to Security group blocking rules. Check AWS Security groups and allow http traffic on port 80 between nodes.


### S3Error: The Access Key Id you provided does not exist in our records

Log example:
```
$ /app/node_modules/.bin/migrate-mongo up --file ./build/dist/src/migrate-mongo-config-hearth.js
ERROR: Could not migrate up 20230331182109-modify-minio-bucket-policy.js: The Access Key Id you provided does not exist in our records. S3Error: The Access Key Id you provided does not exist in our records.
    at parseError (file:///app/node_modules/minio/dist/esm/internal/xml-parser.mjs:20:13)
    at Module.parseResponseError (file:///app/node_modules/minio/dist/esm/internal/xml-parser.mjs:67:11)
```

Due to various reasons credentials may become out of sync between Dependencies and Application namespaces.

If you see following issue on local development environment run `copy_secrets` resource on Tilt dashboard and delete failed PODs.

If you see following issue on server environments sync secrets manually and delete failed PODs.

---

# Running OpenCRVS on Kubernetes

## Prerequisites for Kubernetes Cluster

### Storage

Ensure your cluster has a storage class with encryption, or encryption is implemented at the filesystem level:

- **For existing OpenCRVS installations:**
  Make sure the cluster has at least the `hostpath` storage class configured and directories on the filesystem should point to encrypted partitions.
  `hostpath` is the best option for migration from Docker Swarm to Kubernetes; it allows data to remain untouched. Data can be migrated to more robust storage later, such as `local` or `nfs` volumes after OpenCRVS migration to Kubernetes.

- **For new installations:**
  - Please check the available storage options in the official documentation: [Kubernetes Volumes Documentation](https://kubernetes.io/docs/concepts/storage/volumes/) and [Kubernetes Storage Classes Documentation](https://kubernetes.io/docs/concepts/storage/storage-classes/#provisioner).
  - The recommended storage class for new installations is NFS.

Additionally, explore all possible options for CSI (Container Storage Interface) at the [CSI GitHub repository](https://github.com/kubernetes-csi/).

**NOTE:** Depending on your available hardware resources, you may optimize the installation by splitting data across different types of volumes. For example:
- `Hostpath` works better for Elasticsearch.
- `NFS` is the best option for MinIO and Mongo (or Postgres).

---
### Cert-manager

cert-manager is optional component for traefik and provides an easy way to issue multiple SSL certificates and share it within multiple traefik pods.

If your installation use custom SSL stored as secrets cert-manager is not required.

Recommended way to install cert-manager is a helm chart, see official documentation for more details how to install cert-manager: https://cert-manager.io/docs/installation/helm/

---

### traefik custom changes

traefik is used to proxy OpenCRVS services behind load balancer on kubernetes cluster.

Please change default traefik certificate with your own wildcard or SANs certificate by following guide at https://doc.traefik.io/traefik/https/tls/#default-certificate

If cert-manager is used create `Certificate manifest at traefik namespace:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: k8s-opencrvs-dev-ssl
  namespace: traefik
spec:
  dnsNames:
  - '*.<your domain>'
  - <your domain>
  issuerRef:
    kind: ClusterIssuer
    name: <dns-cluster-issuer>
  secretName: traefik-cert-tls
```

Make sure certificate was issued.
```
kubectl get cert
```

Create default tls store traefik:
```yaml
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: traefik
spec:
  defaultCertificate:
    secretName: traefik-cert-tls

```


## [🚧 ] Manual deployment guide

TODO: Add steps with middleware installation:
- traefik
- dependencies


1. Clone this repository
    ```bash
    git clone https://github.com/opencrvs/infrastructure.git
    ```
2. Create yaml file with custom values for your installation:
   ```yaml
   # Kubernetes load balancer domain used by traefik as entrypoint
   hostname: <you domain>
   # OpenCRVS Core image tag
   image:
     tag: develop
   # Your country image repository and tag
   countryconfig:
     image:
       name: opencrvs/ocrvs-countryconfig
       tag: develop
   ```
   **NOTE:** Please refer to [opencrvs-services/README.md](charts/opencrvs-services/README.md) for full list of options.
3. Install OpenCRVS:
   ```
   helm install opencrvs charts/opencrvs-services
   ```
   **NOTE:** Data seed will run only on `install`, don't use `update --install` for first installation or run data-seeder manually.

# [🚧  Coming soon] Server environment migration

TODO: Migration from docker swarm to kubernetes guide

# Useful Links

- [Kubernetes Volumes Documentation](https://kubernetes.io/docs/concepts/storage/volumes/)
- [Kubernetes Storage Classes Documentation](https://kubernetes.io/docs/concepts/storage/storage-classes/#provisioner)
