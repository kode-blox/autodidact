{{/*
Expand the name of the chart.
*/}}
{{- define "autodidact.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create the name of the runtime Secret.
*/}}
{{- define "autodidact.secretName" -}}
{{- if .Values.externalSecrets.enabled }}
{{- default (include "autodidact.fullname" .) .Values.externalSecrets.targetSecretName }}
{{- else }}
{{- required "secret.existingSecret is required when externalSecrets.enabled=false" .Values.secret.existingSecret }}
{{- end }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "autodidact.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "autodidact.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "autodidact.labels" -}}
helm.sh/chart: {{ include "autodidact.chart" . }}
{{ include "autodidact.selectorLabels" . }}
app.kubernetes.io/component: {{ .Values.kubernetesComponent }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "autodidact.selectorLabels" -}}
app.kubernetes.io/name: {{ include "autodidact.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "autodidact.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "autodidact.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
