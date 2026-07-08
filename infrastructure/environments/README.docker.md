# Environment setup container

Build the image from the infrastructure repository root:

```sh
docker build \
  --file infrastructure/environments/Dockerfile \
  --tag opencrvs-environment-init \
  .
```

Run it with the current infrastructure repository mounted at `/repo`:

```sh
docker run --rm --init \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --publish 3000:3000 \
  --volume "$PWD:/repo" \
  opencrvs-environment-init
```

The container prints `http://127.0.0.1:3000` to the console. Open that URL in a browser. Generated environment files, inventory, and workflow updates are written directly to the mounted repository.
