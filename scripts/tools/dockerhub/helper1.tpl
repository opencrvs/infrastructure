# ORIGINAL HELPER FOR RENDER ENVIRONMENT VARIABLES
{{- define "render-env-vars" -}}
  {{- $service_key_name := ( .service_name | replace "-" "_" ) }}

  {{/* Loop through and generate global environment variables */}}
  {{- range $k, $v := .Values.env }}
            - name: {{ $k }}
              value: {{ $v | quote }}
  {{- end }}
  {{/* Access the service-specific values using the service name */}}
  {{- with index .Values $service_key_name }}
    {{/* Loop through and generate service-specific environment variables */}}
    {{- range $k, $v := .env }}
            - name: {{ $k }}
              value: {{ $v | quote }}
    {{- end }}
    {{/* Loop through and generate secret references for service-specific secrets */}}
    {{- range $secret_name, $secret_values := .secrets }}
      {{- range $secret_value := $secret_values }}
        {{- $secret := split ":" $secret_value }}
            - name: {{ $secret._1 | default $secret._0 }}
              valueFrom:
                secretKeyRef:
                  name: {{ $secret_name }}
                  key: {{ $secret._0 | quote}}
      {{- end }}
    {{- end }}
  {{- end }}
{{- end }}
