# KubeOptix Dashboard

PatternFly 6.6.1 frontend for operating KubeOptix Harvester and KubeOptix Analyzer APIs.

## Features

- Side navigation with two sections: `Harvester` and `Analyzer`
- Harvester actions:
  - `POST /collect`
  - `DELETE /assessment`
- Analyzer actions:
  - `POST /run`
  - `DELETE /reports`
- JSON response viewer for each action with HTTP status badge

## Tech stack

- React + TypeScript + Vite
- PatternFly 6.6.1

## Development

```bash
npm install
npm run dev
```

When running `npm run dev`, Vite loads `.env.development`. The browser uses
clean local paths such as `/namespaces`, `/collect`, and `/run`, and the Vite
development proxy forwards them to the OCP routes. This avoids browser CORS
restrictions without using the dashboard `/api/harvester` or `/api/analyzer`
prefixes. The development targets are:

- `HARVESTER_API_URL=https://harvester-shiftwise-ai.apps-crc.testing`
- `ANALYZER_API_URL=https://analyzer-shiftwise-ai.apps-crc.testing`

Proxy paths used by the frontend outside development:

- `/api/harvester/*`
- `/api/analyzer/*`

## Environment overrides

Copy the environment template to configure the production server locally:

```bash
cp .env.example .env
```

Set both API URLs to addresses reachable from the dashboard process.
For example:

```env
HARVESTER_API_URL=https://harvester.example.com
ANALYZER_API_URL=https://analyzer.example.com
```

## OpenShift deployment

The production container serves the frontend and proxies
`/api/harvester/*` at runtime. The browser never needs direct access to the
internal Harvester service.

Build the image and provide the environment file when running it:

```bash
podman build -t kubeoptix-dashboard -f Containerfile .
podman run --env-file .env -p 8080:8080 kubeoptix-dashboard
```

In OpenShift, configure `HARVESTER_API_URL` on the Deployment. Its default
value in the image is `http://harvester:8000`, which resolves the `harvester`
Service in the same namespace. The dashboard exposes `/healthz` for readiness
and liveness probes.

Analyzer runtime configuration will be added separately.

## Helm installation

The chart in `helm/kubeoptix-dashboard` creates:

- an `ImageStream` and a `BuildConfig` sourced from the `main` branch;
- a `ConfigMap` generated from the root `.env.openshift` file;
- a single-replica `StatefulSet`;
- a `Service` and an edge-terminated HTTPS `Route` with HTTP redirect;
- a `ValidatingAdmissionPolicy` that rejects scaling away from one replica.

The admission policy is cluster-scoped, so install the chart with a user that
can create `ValidatingAdmissionPolicy` and `ValidatingAdmissionPolicyBinding`
resources. The existing `github-auth` Secret must be present in the installation
namespace so the `BuildConfig` can clone the Git repository.

The installation script first creates the `ImageStream` and `BuildConfig`, waits
for the build and image push to complete, and only then creates the remaining
resources:

```bash
./install.sh
```

Follow the image build and rollout:

```bash
oc logs -f bc/kubeoptix-dashboard -n shiftwise-ai
oc rollout status statefulset/kubeoptix-dashboard -n shiftwise-ai
```

Get the generated HTTPS URL:

```bash
oc get route kubeoptix-dashboard -n shiftwise-ai \
  -o jsonpath='https://{.spec.host}{"\n"}'
```
