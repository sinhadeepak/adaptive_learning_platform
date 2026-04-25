{{- define "alp-service.deployment" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "alp-service.fullname" . }}
  labels: {{- include "alp-service.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels: {{- include "alp-service.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "alp-service.selectorLabels" . | nindent 8 }}
        {{- with .Values.podLabels }}{{- toYaml . | nindent 8 }}{{- end }}
      annotations:
        {{- with .Values.podAnnotations }}{{- toYaml . | nindent 8 }}{{- end }}
        # Force rollout on config change
        checksum/config: {{ .Values | toYaml | sha256sum | trunc 8 }}
    spec:
      serviceAccountName: {{ include "alp-service.serviceAccountName" . }}
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile: { type: RuntimeDefault }
      {{- if .Values.topologySpread.enabled }}
      topologySpreadConstraints:
        - maxSkew: {{ .Values.topologySpread.maxSkew }}
          topologyKey: {{ .Values.topologySpread.topologyKey }}
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: {{- include "alp-service.selectorLabels" . | nindent 14 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.containerPort }}
              protocol: TCP
          {{- with .Values.env }}
          env: {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- if .Values.envFromSecret }}
          envFrom:
            - secretRef: { name: {{ .Values.envFromSecret }} }
          {{- end }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: http
            initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
            timeoutSeconds: {{ .Values.probes.liveness.timeoutSeconds }}
            failureThreshold: {{ .Values.probes.liveness.failureThreshold }}
          readinessProbe:
            httpGet:
              path: {{ .Values.probes.readiness.path }}
              port: http
            initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
            timeoutSeconds: {{ .Values.probes.readiness.timeoutSeconds }}
            failureThreshold: {{ .Values.probes.readiness.failureThreshold }}
          resources: {{- toYaml .Values.resources | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
{{- end -}}
