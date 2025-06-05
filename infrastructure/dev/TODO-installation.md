How to install kubernetes on server environment?

# Create user with sudo access

sudo adduser vmudryi
sudo usermod -aG sudo vmudryi

# Single node cluster installation:

sudo snap install k8s --classic
sudo k8s bootstrap
sudo k8s status --wait-ready

Source: https://ubuntu.com/kubernetes/install


# Kuberctl installation:

snap install kubectl --classic
sudo snap install helm --classic

Source: https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/

# Connect to the cluster:

sudo k8s config > ~/.kube/config




# Other manual changes

```
# Give non-root user access to kubectl
mkdir -p /home/vmudryi/.kube
sudo k8s config > /home/vmudryi/.kube/config
sudo chown -R vmudryi:vmudryi /home/vmudryi/.kube

# Add kubectl alias and function to switch namespaces
echo """
alias k=kubectl
function kx(){
       kubectl config set-context --current --namespace $1
}
""" >> ~/.bashrc
```

# Configure hostpath storage:
```
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: hostpath
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: Immediate
```
See [testing volumes](./TODO-testing.md#test-volumes) section for more details.


l2-interfaces=eth0