# NEW HELPER FOR RENDER ENVIRONMENT VARIABLES
{{- define "render-env-vars" -}}
  {{- $service_key_name := .service_name | replace "-" "_" -}}

  {{- $env := dict -}}                                          {{/* initialize empty dict */}}
  {{- if .Values.env }}
    {{- $_ := set $env "global" .Values.env }}
  {{- else }}
    {{- $_ := set $env "global" dict }}
  {{- end }}

  {{- $svc := (index .Values $service_key_name) | default dict }}
  {{- if $svc.env }}
    {{- $_ := set $env "service" $svc.env }}
  {{- else }}
    {{- $_ := set $env "service" dict }}
  {{- end }}

  {{- /* Collect secret keys to dict */}}
  {{- $secrets := dict }}
  {{- if $svc.secrets }}
    {{- range $secret_name, $secret_values := $svc.secrets }}
      {{- range $secret_val := $secret_values }}
        {{- $split := split ":" $secret_val }}
        {{- $var_name := $split._1 | default $split._0 }}
        {{- $_ := set $secrets $var_name (dict "secret" $secret_name "key" $split._0) }}
      {{- end }}
    {{- end }}
  {{- end }}

  {{- /* Compose: global → service → secrets (last wins) */}}
  {{- $result := merge (deepCopy $env.global) $env.service $secrets }}

  {{- range $k, $v := $result }}
    {{- if and (kindIs "map" $v) (hasKey $v "secret") }}
- name: {{ $k }}
  valueFrom:
    secretKeyRef:
      name: {{ $v.secret }}
      key: {{ $v.key | quote }}
    {{- else }}
- name: {{ $k }}
  value: {{ $v | quote }}
    {{- end }}
  {{- end }}

{{- end }}
