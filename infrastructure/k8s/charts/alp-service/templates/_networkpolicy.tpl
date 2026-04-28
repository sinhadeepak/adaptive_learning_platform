{{- define "alp-service.networkpolicy" -}}
{{- if .Values.networkPolicy.enabled -}}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "alp-service.fullname" . }}
  labels: {{- include "alp-service.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels: {{- include "alp-service.selectorLabels" . | nindent 6 }}
  policyTypes: ["Ingress", "Egress"]
  ingress:
    # Ingress from ALB controller + in-cluster callers on http port
    - ports:
        - port: {{ .Values.containerPort }}
          protocol: TCP
  egress:
    {{- if .Values.networkPolicy.allowDns }}
    - to:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: kube-system }
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    {{- end }}
    {{- if .Values.networkPolicy.allowPostgres }}
    - ports:
        - port: 5432
          protocol: TCP
    {{- end }}
    {{- if .Values.networkPolicy.allowRedis }}
    - ports:
        - port: 6379
          protocol: TCP
    {{- end }}
    {{- if .Values.networkPolicy.allowNats }}
    - to:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: nats }
      ports:
        - port: 4222
          protocol: TCP
    {{- end }}
    {{- if .Values.networkPolicy.allowOpenSearch }}
    - ports:
        - port: 443
          protocol: TCP
    {{- end }}
    # HTTPS egress for external APIs (Stripe, SendGrid, etc.) — narrow in prod via egress controller
    - ports:
        - port: 443
          protocol: TCP
{{- end -}}
{{- end -}}
