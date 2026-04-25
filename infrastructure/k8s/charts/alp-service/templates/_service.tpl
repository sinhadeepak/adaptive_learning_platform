{{- define "alp-service.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "alp-service.fullname" . }}
  labels: {{- include "alp-service.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
  selector: {{- include "alp-service.selectorLabels" . | nindent 4 }}
{{- end -}}
