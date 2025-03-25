Troubleshooting inside Kubernetes cluster

1. Issue fresh token:

  ```bash
  USERNAME=o.admin
  SUPER_USER_PASSWORD=password
  curl -X POST "http://auth.opencrvs-dev.svc.cluster.local:4040/authenticate-super-user" \
      -H "Content-Type: application/json" \
      -d '{
        "username": "'"${USERNAME}"'",
        "password": "'"$SUPER_USER_PASSWORD"'"
      }'
  ```

2. Check gateway host:
  ```bash
    GATEWAY_HOST=http://gateway.opencrvs-dev.svc.cluster.local:7070
    curl -X GET \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${token}" \
        ${GATEWAY_HOST}/locations?type=ADMIN_STRUCTURE&_count=0
  ```
3. Check config host:
  ```bash
  curl -v -X GET \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${token}" \
      http://config.opencrvs-dev.svc.cluster.local:2021/locations?type=ADMIN_STRUCTURE&_count=0
  ```
4. Check Hearth:
  ```bash
  curl -v http://hearth.opencrvs-deps-dev.svc.cluster.local:3447/fhir/Location
  ```

# Issues

Login page is not loading: Check login logs
```
2025/03/19 07:53:38 [error] 15#15: *1 upstream timed out (110: Connection timed out) while connecting to upstream, client: 10.1.3.102, server: localhost, request: "GET /api/countryconfig/login-config.js HTTP/1.1", upstream: "http://10.100.14.175:3040/login-config.js", host: "login.opencrvs.localhost", referrer: "https://login.opencrvs.localhost/"
```

Solution: restart nginx inside login container or delete login pod
```
nginx -s reload
```

