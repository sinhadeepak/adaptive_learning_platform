{{/*
Aggregator — a consuming chart renders `{{ include "alp-service.render" . }}`
from its single templates/all.yaml file. This emits every resource the
library provides, separated by YAML document markers.
*/}}

{{- define "alp-service.render" -}}
{{ include "alp-service.serviceaccount" . }}
{{- if .Values.serviceAccount.create }}
---
{{- end }}
{{ include "alp-service.deployment" . }}
---
{{ include "alp-service.service" . }}
{{- if .Values.autoscaling.enabled }}
---
{{ include "alp-service.hpa" . }}
{{- end }}
{{- if .Values.serviceMonitor.enabled }}
---
{{ include "alp-service.servicemonitor" . }}
{{- end }}
{{- if .Values.networkPolicy.enabled }}
---
{{ include "alp-service.networkpolicy" . }}
{{- end }}
{{- end -}}
