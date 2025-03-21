# !!! Work in progress

Not all features available in docker swarm solution are supported now.

Limitations:
- Only manual helm installation and upgrade
- Manual initial users configuration for minio, mongodb, elastic search
- No data reset feature

# General information

Repository to store infrastructure code for OpenCRVS deployment


# OpenCRVS on Kubernetes

## Kubernetes cluster Prerequisites

### Storage

Storage class with encryption or respective encryption is implemented at filesystem level:
- For existing OpenCRVS installations make sure cluster has at least `hostpath` storage class configured and directories on file system are pointed to encrypted partitions. `hostpath` is the best option for drop-in replacement docker swarm to kubernetes, data will not be touched in that case. Later data can be migrated to more robust storage, e/g `local` or `nfs` volumes.
- For new installations please check available options at official documentation [[1]](https://kubernetes.io/docs/concepts/storage/volumes/), [[2]](https://kubernetes.io/docs/concepts/storage/storage-classes/#provisioner). Recommended storage class for new installations is NFS.

Please also check all available options for CSI at: https://github.com/kubernetes-csi/

**NOTE:** Depending on available hardware resources it is also possible to optimize installation by splitting data into different types of volumes, e/g `hostpath` works better for Elasticsearch, while `NFS` is best option for `minio` and `mongo` (`postgres`)



# Links

[1] https://kubernetes.io/docs/concepts/storage/volumes/

[2] https://kubernetes.io/docs/concepts/storage/storage-classes/#provisioner