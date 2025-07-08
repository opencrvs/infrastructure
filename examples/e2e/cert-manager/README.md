# Prerequisites
Create API Token in Cloudflare


Verify token:
```bash
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer ..." 
```

Update `cloudflare-api-token.yaml` with your Cloudflare API token and zone ID.

# Install cert-manager

```bash
helm install \
   cert-manager jetstack/cert-manager \
   --namespace cert-manager \
   --create-namespace \
   --version v1.17.0 \
   --set crds.enabled=true

kubectl apply -f cloudflare-api-token.yaml

kubectl apply -f issuer.yaml
```