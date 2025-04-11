FROM summerwind/actions-runner
USER root
RUN apt-get update && apt-get install -y curl unzip gnupg
RUN curl -LO "https://dl.k8s.io/release/v1.29.0/bin/linux/amd64/kubectl" \
 && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
RUN cat /etc/passwd
USER runner
