This document describes installation issues with Google Cloud environment

# SSL Certificate

Google cloud is closer to production then local environment and valid SSL certificate is needed.

There was unknown issue with domain resolution and port availability for HTTP-01 challenge:

```
2025-03-31T11:25:24Z ERR Unable to obtain ACME certificate for domains error="unable to generate a certificate for the domains [minio.k8s.opencrvs.dev k8s.opencrvs.dev]: error: one or more domains had a problem:\n[k8s.opencrvs.dev] invalid authorization: acme: error: 400 :: urn:ietf:params:acme:error:connection :: 34.76.218.203: Fetching http://k8s.opencrvs.dev/.well-known/acme-challenge/n56NAA3Kz1hEMwppqiB7R_o5E_evKEFpY0N-t69IO1k: Connection refused\n[minio.k8s.opencrvs.dev] invalid authorization: acme: error: 400 :: urn:ietf:params:acme:error:connection :: 34.76.218.203: Fetching http://minio.k8s.opencrvs.dev/.well-known/acme-challenge/Cy767lSM3pVhmTPUhFqrKrhy00r1kGFVY7fysh4hm6E: Connection refused\n" ACME CA=https://acme-v02.api.letsencrypt.org/directory acmeCA=https://acme-v02.api.letsencrypt.org/directory domains=["minio.k8s.opencrvs.dev","k8s.opencrvs.dev"] providerName=letsencrypt.acme routerName=opencrvs-deps-dev-minio-route-4c9a8d185dcb6baf7479@kubernetescrd rule="Host(`minio.k8s.opencrvs.dev`) || Host(`k8s.opencrvs.dev`)"
```

I have not found correct solution to this issue and as bypass used DNS-01 challenge, see file in cert-manager folder.

Some benefits of DNS-01 challenge:
- traefik could be scaled up to as many PODs as needed


Probably we could replace traefik default SSL certificate