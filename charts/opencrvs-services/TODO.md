# Monitoring

1. Review option of replacing ELK with something more simple

# Data persistence

How can we prevent volumes from removal?
Is `Retain` sufficient for us?

# Add minio-mc container

TODO: Check if container is needed


# Change nginx based container default port

On AWS traffic is not allowed for containers on port 80.

client and login containers are using port 80 as default.

Node security group should be modified to allow traffic.