
# 🚧 Work in Progress

Please note that not all features from the Docker Swarm solution are supported yet.

**Limitations:**
- Manual Helm installation and upgrade only
- Manual initial user configuration for MinIO, MongoDB, Elasticsearch
- No data reset feature available

---

# General Information

This repository is used to store infrastructure code for deploying OpenCRVS.

---

# OpenCRVS on Kubernetes

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

# Development with Kubernetes

## Prerequisites

Ensure you have one of the following solutions installed on your laptop:
- [**Recommended**]: Docker Desktop (with Kubernetes enabled): https://www.docker.com/products/docker-desktop/. Please check following:
  - Enable host networking
  - Enable Kubernetes
- MicroK8s: https://microk8s.io/
- Minikube: https://minikube.sigs.k8s.io/docs/

You will also need the following tools for running the local development environment:
- Git: https://git-scm.com/downloads
- Helm: https://helm.sh/
- Kubectl: https://kubernetes.io/docs/tasks/tools/
- Tilt: https://tilt.dev/

**NOTE:** This guide does not cover the installation of these prerequisites.

---

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
5. Change directory to the OpenCRVS Core repository:
    ```bash
    cd opencrvs-core
    ```
6. [Temporary Step] Switch to the k8s-version branch:
    ```bash
    git checkout k8s-version
    ```
7. Run Tilt:
    ```bash
    tilt up
    ```
8. Navigate to [http://localhost:10350/](http://localhost:10350/)
9. Once all container images are up and running your environment will be available at https://opencrvs.localhost

---

## [🚧  Coming soon] For OpenCRVS Country Configuration Developers

You need to fork the [opencrvs-countryconfig](https://github.com/opencrvs/opencrvs-countryconfig) repository and clone the [infrastructure](https://github.com/opencrvs/infrastructure) repository. If these repositories are already on your laptop, ensure they are in the same folder.

1. Create a new folder or use an existing folder to store the repositories.
2. Open a terminal (command line) and navigate to the folder.
3. Clone your fork of the OpenCRVS Country Configuration repository:
    ```bash
    git clone git@github.com:<your-github-account>/<your-repository>.git
    ```
4. Clone the Infrastructure repository:
    ```bash
    git clone git@github.com:opencrvs/infrastructure.git
    ```
5. Change directory to your forked repository:
    ```bash
    cd <your-repository>
    ```
6. [Temporary Step] Switch to the k8s-version branch:
    ```bash
    git checkout k8s-version
    ```
7. Run Tilt:
    ```bash
    tilt up
    ```
8. Navigate to [http://localhost:10350/](http://localhost:10350/)
9. Once all container images are up and running your environment will be available at https://opencrvs.localhost

## Common issues

### Countryconfig is failing with ImagePullBackOff

Check image tag was set properly, use `kubectl`, adjust value in `kubernetes/opencrvs-services/values-dev.yaml`

---


# Useful Links

- [Kubernetes Volumes Documentation](https://kubernetes.io/docs/concepts/storage/volumes/)
- [Kubernetes Storage Classes Documentation](https://kubernetes.io/docs/concepts/storage/storage-classes/#provisioner)
