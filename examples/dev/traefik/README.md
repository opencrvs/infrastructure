
# Install Traefik

Available installation options:
- `values.yaml`: Default lets-encrypt configuration with HTTP-01 challenge
- `values-dns-challenge.yaml`: Lets-encrypt configuration with DNS challenge
- `values-custom-ssl.yaml`: Custom SSL Certificate example

# How to install?

```
helm upgrade --install traefik traefik-repo/traefik --namespace traefik --create-namespace -f values.yaml
```
