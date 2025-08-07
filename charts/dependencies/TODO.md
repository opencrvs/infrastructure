List of upcoming (desired) changes:
- Refactor IngressRoute section:
  ```
  {{- if .Values.ingress.tls_resolver }}
  tls:
    certResolver: {{ .Values.ingress.tls_resolver }}
  {{- end }}
  {{- if .Values.ingress.tls_secret_name }}
  tls:
    secretName: {{ .Values.ingress.tls_secret_name }}
  {{- end }}
  ```

Open Questions:
- Should we build dedicated helm chart for Monitoring?
  Deployment may fail on larger clusters due to issue with filebeat and metricbeat don't start before kibana deployment.