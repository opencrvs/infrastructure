{{- define "elasticsearch-reindex.containerSpec" -}}
- name: elasticsearch-reindex
  command: ["sh", "-c", "apk add --no-cache curl jq && /scripts/reindex.sh"]
  image: "alpine"
  env:
    - name: AUTH_URL
      value: "http://auth.{{ .Release.Namespace }}.svc.cluster.local:4040"
    - name: EVENTS_URL
      value: "http://events.{{ .Release.Namespace }}.svc.cluster.local:5555"
  volumeMounts:
    - mountPath: /scripts
      name: elasticsearch-reindex-script
{{- end }}
{{- define "elasticsearch-reindex.volumes" -}}
- name: elasticsearch-reindex-script
  configMap:
    name: elasticsearch-reindex-script
    defaultMode: 0755
{{- end }}