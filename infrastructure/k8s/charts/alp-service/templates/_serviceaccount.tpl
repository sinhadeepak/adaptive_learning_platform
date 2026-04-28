{{- define "alp-service.serviceaccount" -}}
{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "alp-service.serviceAccountName" . }}
  labels: {{- include "alp-service.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations: {{- toYaml . | nindent 4 }}
  {{- end }}
automountServiceAccountToken: true
{{- end -}}
{{- end -}}
