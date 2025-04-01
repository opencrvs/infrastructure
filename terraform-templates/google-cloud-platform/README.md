# What is the purpose of this repository?

This repository contains the configuration of services for OpenCRVS infrastructure on Google cloud platform.

# How to use this repository?

Each folder within the repository is a separate Terraform module that contains a portion of the infrastructure code. The modules are dependent on each other. 
By convention, the numbering of folders corresponds to the order in which the infrastructure should be created and explicitly reflects the dependencies between modules. For example, `01.common` should be created before `02.gke_cluster`.

# How to create infrastructure?

**NOTE:** All actions should be performed inside https://github.com/opencrvs/infrastructure repository.

Prerequisites:
- Google cloud service account with owner permissions and key, in this document key is stored at `/home/user/.terraform/opencrvs-on-k8s.json`
- `terraform` version 1.11+

Export path to your key:
    
```bash
# (This is just example, update path before running command)
export GOOGLE_CLOUD_KEYFILE_JSON=/home/user/.terraform/opencrvs-on-k8s.json
export GOOGLE_APPLICATION_CREDENTIALS=/home/user/.terraform/opencrvs-on-k8s.json
```

## Create initial infrustructure

1. Navigate to `terraform-template/01.common`
2. Update `terraform.tfvars`, put your GCP project name and location, for example:
    ```
    project_id = "opencrvs-on-k8s"
    location = "europe-west1"
    ```
3. Run terraform init and plan
    
    ```bash
    terraform init
    terraform plan
    ```
    
4. If plan looks good to you then apply your changes:
    
    ```bash
    terraform apply
    # don't forget to approve changes by typing `yes`
    ```
    
5. Once changes applied, go to and add remote backend:

    
    ```bash
      backend "gcs" {
         bucket = "opencrvs-app-terraform-bucket"
         prefix = "states/common"
      }
    ```
    
6. Migrate backend to remote
    
    ```bash
      terraform init -migrate-state
    ```

## Create kubernetes cluster

**NOTE**: This terraform code allows to create multiple kubernetes clusters within the same GPC project or within multiple GCP projects. Primary goal for segregation is ability to create multiple identical environments (dev, qa, e2e, stg, production) using the same terraform code.

1. Navigate to `terraform-template/02.gke_cluster` 
9. Run terraform init
    
    ```bash
      terraform init
    ```
    
9. Create workspace for your environment, e/g `dev` 
    
    ```bash
    terraform workspace new dev
    ```
    
10. Create terraform values file in folder `envs/`. e/g `dev.tfvars`:
    
    ```bash
    # Set/Override any variables defined in variables.tf
    project_id = "opencrvs-on-k8s"
    location = "europe-west1"
    env = "dev"
    
    # GKE Cluster
    gke_cluster_name = "gke-dev"
    
    gke_use_spot_instance_type = true
    gke_master_ipv4_cidr_block = "10.5.0.0/28"
    gke_node_ipv4_cidr_block = "10.5.1.0/24"
    gke_pod_ipv4_cidr_block = "10.6.0.0/16"
    gke_services_ipv4_cidr_block = "10.7.0.0/20"
    gke_machine_type = "e2-highmem-2"
    
    ```
    
11. Run plan:
    
    ```bash
    terraform workspace select dev
    terraform plan -var-file envs/dev.tfvars
    ```
    
12. Create cluster:
    
    ```bash
    terraform apply -var-file envs/dev.tfvars
    ```
