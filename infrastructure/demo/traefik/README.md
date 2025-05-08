helm upgrade --install traefik traefik-repo/traefik --namespace traefik --create-namespace -f values.yaml

kubectl apply -f  wildcard-certificate.yaml

# Wait few minutes

kubectl apply -f tlsstore.yaml


kubectl patch storageclass gp2 -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
