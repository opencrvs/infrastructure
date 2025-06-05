helm repo add traefik-repo https://traefik.github.io/charts
helm upgrade --install traefik traefik-repo/traefik --namespace traefik --create-namespace -f values.yaml


k get svc

traefik          traefik                             LoadBalancer   10.152.183.57    <pending>     80:30285/TCP,443:30795/TCP   13m

vmudryi@k8s-e2e-poc:~$ curl -v 157.180.92.109:30285
*   Trying 157.180.92.109:30285...
* Connected to 157.180.92.109 (157.180.92.109) port 30285
> GET / HTTP/1.1
> Host: 157.180.92.109:30285
> User-Agent: curl/8.5.0
> Accept: */*
> 
< HTTP/1.1 404 Not Found
< Content-Type: text/plain; charset=utf-8
< X-Content-Type-Options: nosniff
< Date: Mon, 02 Jun 2025 15:27:54 GMT
< Content-Length: 19
< 
404 page not found
* Connection #0 to host 157.180.92.109 left intact




Test volumes:
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: hostpath
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: Immediate
---
# hostpath-pv.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: mongodb-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  storageClassName: hostpath
  hostPath:
    path: /data/mongodb
  persistentVolumeReclaimPolicy: Retain
---
# hostpath-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: hostpath
  volumeName: mongodb-pv

---
apiVersion: v1
kind: Pod
metadata:
  name: mongodb-tester
spec:
  containers:
    - name: test
      image: busybox
      command: [ "sleep", "3600" ]
      volumeMounts:
        - mountPath: /mnt/storage
          name: storage
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: mongodb-pvc