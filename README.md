# 🚧 Work in Progress

> NOTE:
> All scripts within this repository are relevant to OpenCRVS version 1.9.0 and higher.

Please note that not all features from the Docker Swarm solution are supported yet and not all pipelines are implemented

---

# General Information

This document provides guidance on running OpenCRVS both locally (on your PC or laptop) and on server environments using Kubernetes. It is intended for developers contributing to OpenCRVS, DevOps engineers deploying OpenCRVS in various environments, and anyone interested in installing, running, or testing OpenCRVS features.

# Repository content

- [charts](charts), OpenCRVS helm charts
- [github-runner](github-runner), configuration files required to deploy self-hosted runner
- [terraform-templates](terraform-templates), configuration templates to deploy cloud environments on different platforms
- [examples](examples), pre-defined values for helm charts and additional documentation and deployment scenarios for OpenCRVS

# Quickstart

> **NOTE:** Before running commands from Quickstart instructions make sure your kubernetes cluster meets all requirements.

Check quickstart instructions how to deploy OpenCRVS to Kubernetes cluster at [charts/opencrvs-services](charts/opencrvs-services/README.md#-quickstart)

# Examples

Single server deployment flow is example is describe at [examples/dev](./examples/dev/README.md) 