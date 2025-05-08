 helm install \
   cert-manager jetstack/cert-manager \
   --namespace cert-manager \
   --create-namespace \
   --version v1.17.0 \
   --set crds.enabled=true

kubectl apply -f cloudflare-api-token.yaml 

kubectl apply -f issuer.yaml
