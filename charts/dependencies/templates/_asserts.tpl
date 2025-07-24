{{- if and .Values.monitoring.enabled (not .Values.elasticsearch.use_default_credentials) }}
{{- fail "Invalid configuration: Cannot enable both monitoring and use default Elasticsearch credentials." }}
{{- end }}
