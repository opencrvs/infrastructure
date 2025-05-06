# -*- mode: Starlark -*

######################################################
# Add labels to resources
opensrvs_services = [
  'auth', 
  'config',
  'client',
  'countryconfig',
  'dashboards', 
  'documents', 
  'events',
  'gateway',
  'login',
  'metrics', 
  'data-migration', 
  'notification', 
  'scheduler', 
  'search', 
  'user-mgnt', 
  'webhooks', 
  'workflow'
]

tilt_label = '1.OpenCRVS'
for workload in opensrvs_services:
  k8s_resource(workload, labels=[tilt_label])

dependencies = [
  'traefik',
  'elasticsearch',
  'hearth',
  'mongodb',
  'minio', 
  'influxdb', 
  'redis',
]

# OpenCRVS application has traefik CRDs IngressRoute
# and Middleware, so we need to add traefik as dependency
# to all workloads that use them
traefik_deps = opensrvs_services
traefik_deps.append('minio')
for workload in traefik_deps:
  k8s_resource(workload, resource_deps=['traefik'])

tilt_label = '3.Dependencies'
for workload in dependencies:
  k8s_resource(workload, labels=[tilt_label])

readme_header = """
====================================================================================
More information are available at https://github.com/opencrvs/infrastructure
====================================================================================
"""

local_resource('README.md', cmd='awk "/For OpenCRVS Core Developers/{flag=1; next} /For OpenCRVS Country Config Developers/{flag=0} flag" ../README.md', labels=['0.Readme'])
