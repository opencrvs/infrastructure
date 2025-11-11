FROM summerwind/actions-runner
USER root
RUN apt-get update && apt-get upgrade -y && apt-get install -y curl unzip gnupg
RUN curl -LO "https://dl.k8s.io/release/v1.34.0/bin/linux/amd64/kubectl" \
 && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
RUN curl -L -o /usr/local/bin/yq https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_amd64 \
    && chmod +x /usr/local/bin/yq

# HOTFIX: Remove after summerwind/actions-runner image is updated with Docker v25+
RUN DOCKER_VERSION=29.0.0 \
    && ARCH=$(echo ${TARGETPLATFORM} | cut -d / -f2) \
    && if [ "$ARCH" = "arm64" ]; then export ARCH=aarch64 ; fi \
    && if [ "$ARCH" = "amd64" ] || [ "$ARCH" = "i386" ]; then export ARCH=x86_64 ; fi \
    && echo https://download.docker.com/linux/static/${CHANNEL}/${ARCH}/docker-${DOCKER_VERSION}.tgz \
    && curl -fLo docker.tgz https://download.docker.com/linux/static/stable/x86_64/docker-29.0.0.tgz \
    && tar zxvf docker.tgz \
    && install -o root -g root -m 755 docker/docker /usr/bin/docker \
    && rm -rf docker docker.tgz 
USER runner
