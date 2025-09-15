
> 🚧 NOTE: **Work in Progress**
>
> Repository content is relevant to OpenCRVS version v1.9.0 or higher.
>
> Please note that not all features from the Docker Swarm solution are supported yet and not all pipelines are implemented

---

# General Information

This document provides guidance on running OpenCRVS both locally (on your PC or laptop) and on server environments using Kubernetes. It is intended for developers contributing to OpenCRVS, DevOps engineers deploying OpenCRVS in various environments, and anyone interested in installing, running, or testing OpenCRVS features.

# Repository content

- [charts](charts), OpenCRVS helm charts
- [github-runner](github-runner), configuration files required to deploy self-hosted runner
- [terraform-templates](terraform-templates), configuration templates to build cloud environments for OpenCRVS on different providers
- [examples](examples), pre-defined values for helm charts and additional documentation and deployment scenarios for OpenCRVS

# Quickstart localhost

Check quickstart instructions how to deploy OpenCRVS to existing docker-desktop or minikube Kubernetes cluster running on your laptop at [charts/opencrvs-services](charts/opencrvs-services/README.md#-quickstart)

# Examples

Single server deployment flow is example is describe at [examples/dev](./examples/dev/README.md)

# System requirements

## Desktop / Quickstart system requirements

### Hardware requirements
- 16G RAM
- 8 CPU (at least Intel 8th generation)
- 100G free storage space

### Software requirements

| Tool       | Description |
| ---------- | ----------- |
| Kubernetes | For macOS and Windows users, we recommend Docker Desktop with Kubernetes, [Learn more](https://www.docker.com/); for Linux users, we recommend Minikube, [Learn more](https://minikube.sigs.k8s.io/docs/start). More information about setting up Kubernetes can be found in the [Docker engine with Kubernetes cluster](#docker-engine-with-kubernetes-cluster) section. |
| kubectl    | Kubernetes command-line tool. [Documentation](https://kubernetes.io/docs/tasks/tools/). |
| helm       | Helm, a template engine for managing Kubernetes manifests. [Learn more](https://helm.sh/). |

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

Add following values to /etc/sysctl.conf for linux (Ubuntu) users:
```
fs.inotify.max_user_instances = 8192
fs.inotify.max_user_watches = 65536
```
If you already have minikube cluster running, please recreate it (delete/start) to apply changes properly/

Start minikube with unlimited amount of memory:
```
minikube start --memory=max
```

Start load balancer (tunnel) on localhost to proxy requests from your browser inside minikube cluster:
```
minikube tunnel -c --bind-address='127.0.0.1'
```

---

**NOTE:** Any other Kubernetes solution for desktop should work as well. Please check to LoadBalancer and kubernetes services setup if you are not able to access service.
