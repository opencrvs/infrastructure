Install local path provisioner

```
helm repo add local-path-provisioner https://charts.containeroo.ch
helm install local-path-provisioner local-path-provisioner/local-path-provisioner \
  --namespace local-path-storage \
  --create-namespace \
  --values local-path-provisioner-values.yaml
```