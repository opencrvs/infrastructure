
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

# Demo / Quickstart system requirements

Check quickstart instructions how to deploy OpenCRVS to existing docker-desktop or minikube Kubernetes cluster running on your laptop at [charts/opencrvs-services](charts/opencrvs-services/README.md#-quickstart)


# Development environment setup

Kubernetes is the easiest option to run OpenCRVS locally on your PC or Laptop and test all features and functionality.
Before running make sure all hardware and software requirements are met.

Once you make sure your development environment is ready for running OpenCRVS we are recommending you start from "For OpenCRVS DevOps" configuration and get familiar with all tools used to deploy OpenCRVS locally (tilt, kubectl, helm). In that particular configuration all docker images are pulled from our registry and OpenCRVS application is starting with Falajaland demo data. No additional actions are needed from your side.


The OpenCRVS team uses [Tilt](https://tilt.dev/) to manage the local development environment. Depending on your role and development needs, the following configurations (Tiltfiles) are available:

- [DevOps developers](#for-opencrvs-devops), This basic configuration is designed for Helm chart development. Tilt uses official OpenCRVS release images along with the Farajaland demo data. Docker images are pulled from the OpenCRVS container registry.
- [Country config developers](#for-opencrvs-country-config-developers), In this setup, OpenCRVS Core images are pulled from the OpenCRVS container registry. The Country Config image is built locally using Tilt's live update feature, so your code changes are reflected almost immediately. Typically, you’ll be working with your own fork of the Country Config repository.
- [Core developers](#for-opencrvs-core-developers), This configuration builds OpenCRVS Core images locally with live updates enabled, allowing near-instant reflection of code changes. By default, the Country Config image is pulled from the OpenCRVS container registry. If you maintain your own fork of the Country Config repository and container registry, you should update the Tiltfile to use your own registry.

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

### Docker engine and Kubernetes cluster

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
```bash
minikube start --cpus=8 --memory=max --ports=80:30080
```

- `--cpus`: Number of CPUs allocated to Kubernetes. Use "max" to use the maximum number of CPUs
- `--memory`: Amount of RAM to allocate to Kubernetes (format: <number>[<unit>], where unit = b, k, m or g).
- `--ports`: List of ports that should be exposed (docker and podman driver only)


---

**NOTE:** Any other Kubernetes solution for desktop should work as well. Please check to LoadBalancer and kubernetes services setup if you are not able to access service.


## For OpenCRVS DevOps

1. Clone this repository:
   ```
   git clone https://github.com/opencrvs/infrastructure
   ```
2. Run:
   ```
   tilt up
   ```
3. Navigate to [http://localhost:10350/](http://localhost:10350/)
4. Run [Data seed](#initial-data-seeding-with-tilt) resource
5. Once all container images are up and running your environment will be available at http://opencrvs.localhost


## For OpenCRVS Country Config Developers

1. Clone OpenCRVS Country Config repository:
    
    For county config use:
    ```bash
    git clone https://github.com/opencrvs/opencrvs-countryconfig
    ```
    For your own fork use:
    ```bash
    git clone git@github.com:<your-github-account>/<your-repository>.git
    ```
2. Run Tilt:
    ```bash
    tilt up
    ```
3. Navigate to [http://localhost:10350/](http://localhost:10350/)
4. Run [Data seed](#initial-data-seeding-with-tilt) resource
5. Once all container images are up and running your environment will be available at http://opencrvs.localhost


## For OpenCRVS Core Developers

1. Clone the OpenCRVS Core repository:
    ```bash
    git clone git@github.com:opencrvs/opencrvs-core.git
    ```
2. Run Tilt:
    ```bash
    tilt up
    ```
3. Navigate to [http://localhost:10350/](http://localhost:10350/)
4. Run [Data seed](#initial-data-seeding-with-tilt) resource
5. Once all container images are up and running your environment will be available at http://opencrvs.localhost

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

# Server setup

## [Single server deployment steps](./examples/dev/README.md)