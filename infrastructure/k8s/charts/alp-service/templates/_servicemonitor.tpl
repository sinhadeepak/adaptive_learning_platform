{{- define "alp-service.servicemonitor" -}}
{{- if .Values.serviceMonitor.enabled -}}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "alp-service.fullname" . }}
  labels:
    {{- include "alp-service.labels" . | nindent 4 }}
    release: kps   # kube-prometheus-stack release label — required for auto-discovery
spec:
  selector:
    matchLabels: {{- include "alp-service.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: http
      path: {{ .Values.serviceMonitor.path }}
      interval: {{ .Values.serviceMonitor.interval }}
      scrapeTimeout: {{ .Values.serviceMonitor.scrapeTimeout }}
{{- end -}}
{{- end -}}
