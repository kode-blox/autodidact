# AutoDidact Helm chart

This chart deploys the reader, separate application and metrics Services, and
optional Gateway API, External Secrets, and ServiceMonitor resources. It uses one
replica and `Recreate` updates to keep one active process per learner-state bucket.

For a first deployment, follow [Self-hosting](https://autodidact.kodeblox.com/self-hosting) for storage, course files, and authentication. The install command below uses a private `ClusterIP` Service.

## Required secret

By default, `secret.existingSecret` must name a Secret in the release namespace.
Supply the following keys when using static S3 credentials.

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN (when required)
```

An SDK-supported workload role can supply the credentials. Create an empty
Secret for the chart reference when using that role.

Set `externalSecrets.enabled=true` to let the chart create an ExternalSecret.
The External Secrets Operator CRDs must already be installed. Set
`externalSecrets.secretStore` to the ClusterSecretStore name and map keys in
`externalSecrets.secrets`. Use `externalSecrets.targetSecretName` to choose the
generated Secret name.

Secret values injected through `envFrom` are read only when a container starts.
After rotating either an existing Secret or an ExternalSecret-managed Secret,
restart the Deployment. A Secret-reloader controller may automate that restart.
Configure it through `podAnnotations` when one is installed in the cluster.

## Courses and assets

The chart serves the courses and assets bundled in the image.

Use `extraContainers` to append container specifications to the Deployment, for
example a git-sync sidecar. Configure shared storage through `volumes` and the
reader's `volumeMounts`. Each additional container supplies its own mounts,
environment, resources, and security context. Helm replaces list values, so keep
the existing Next.js cache volume and mount when overriding those lists.

For live course updates, mount git-sync's shared volume read-only in the reader
and set `environmentsVars.AUTODIDACT_EXTERNAL_COURSES_DIR` to its checkout's
`courses` directory, such as `/var/lib/autodidact/course-sync/current/courses`.
The [self-hosting guide](https://autodidact.kodeblox.com/self-hosting) describes
the checkout layout and reload behavior.

## Install

Set `environmentsVars.AUTODIDACT_PUBLIC_URL` to the exact browser-facing origin. Use the
storage settings for your provider and set `environmentsVars.AUTODIDACT_S3_BUCKET` to a dedicated bucket for each deployment.

For AWS S3, leave the endpoint empty as in this example. For another provider,
supply its endpoint and matching region.

```shell
helm upgrade --install autodidact ./charts \
  --namespace autodidact \
  --create-namespace \
  --set environmentsVars.AUTODIDACT_PUBLIC_URL=http://127.0.0.1:8080 \
  --set-string environmentsVars.AUTODIDACT_S3_ENDPOINT= \
  --set environmentsVars.AUTODIDACT_S3_REGION=us-east-1 \
  --set environmentsVars.AUTODIDACT_S3_BUCKET=personal-learning \
  --set secret.existingSecret=autodidact
```

```shell
kubectl -n autodidact port-forward svc/autodidact 8080:8080
```

Set `namespace.create=true` when a GitOps or rendered-manifest workflow should
create `.Release.Namespace` from the chart. Optional `namespace.labels` and
`namespace.annotations` are applied to it. To retain the Namespace after Helm
uninstall, supply the retention annotation.

```yaml
namespace:
  annotations:
    helm.sh/resource-policy: keep
```

For a direct Helm install into a new namespace, pass `--create-namespace` so
Helm can create its release namespace before applying the chart templates.

The optional Gateway uses the `cloudflare` HTTP listener on port `8001`,
with HTTPS handled upstream. Protect the entire origin with authentication or
a private network before enabling the Gateway. Configure middleware names on
each route; they render as Traefik Middleware references in the listed order.
The middleware list may be omitted. A rule defaults to the chart's application
Service unless `backend.name`, `backend.namespace`, or `backend.port` overrides
the corresponding value. A backend in another namespace requires a
`ReferenceGrant` in that namespace.

```yaml
gateway:
  enabled: true
  hosts:
    - host: learn.example.com
  rules:
    - path: /
      middlewares:
        - authentication
```

`/api/health` checks readable storage for readiness. The TCP liveness probe
checks the application process independently of the storage provider.

## Metrics

The internal `ClusterIP` Service serves Prometheus process metrics at
`/metrics` on port `9090` by default. Use `containerPorts.metrics` to change
the listener port and `metricsService.port` to change the Service port.

If the Prometheus Operator's ServiceMonitor CRD is installed, set
`serviceMonitor.enabled=true` to configure scraping. Set `serviceMonitor.labels`
to match your Prometheus instance's selector when needed.
