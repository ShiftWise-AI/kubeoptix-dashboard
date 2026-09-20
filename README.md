# KubeOptix Dashboard

React + TypeScript web dashboard for operating the ShiftWise AI / KubeOptix assessment workflow. The interface coordinates data collection, analysis, report editing, document versioning, and system configuration with PatternFly.

## Workflow overview

The main workflow is sequential:

1. Configuration: creates the single system configuration record, sets the language and default extraction method, configures model and API-key fields, and optionally uploads a PNG, JPEG, WEBP, or SVG logo (maximum 2 MB). The rest of the operational workflow remains unavailable until this record exists.
2. Harvester: selects namespaces, starts assessment collection, monitors progress, inspects the collected tree, and removes data when needed.
3. Analyzer: selects namespaces and runs generative (LLM) or predictive (machine learning) analysis. Long-running jobs are polled until completion.
4. Reports: reviews generated Markdown reports, edits content, views or downloads Markdown, and saves document versions with metadata.

The reports screen also manages author and customer lists. A document can have multiple authors and customers; each author/customer combination is represented as a document record while a single report remains visible in the list. Saved reports are marked with their version, while drafts remain unsaved.

When a document is saved, the dashboard writes the edited Markdown to the reporter service, creates document/version records in the configuration service, and removes the raw file from the AI report repository. The saved document remains visible in the configuration database. It can also be exported as PDF; the dashboard rehydrates the file before requesting the reporter PDF endpoint when the source is no longer available on disk.

## Backend services and proxy routes

The browser calls only the dashboard's local routes. During development, Vite proxies these requests. In production, `server.mjs` runs the same proxy at runtime:

| Dashboard route | Upstream responsibility |
| --- | --- |
| `/api/harvester/*` and collection paths | Namespace discovery, collection, status, and assessment data |
| `/api/analyzer/*` | Generative analysis, status, namespaces, and analyzer report listing |
| `/api/reporter/*` | Markdown read/write and PDF rendering |
| `/api/core-ai/*` | Predictive analysis and core AI operations |
| `/api/reports/*` | Core AI report status and file deletion |
| `/api/settings/*` | System settings, logo, authors, customers, documents, and versions |

The proxy keeps upstream service URLs out of the browser and provides a single entry point for the frontend.

## Technology stack

- React 19
- TypeScript in strict mode
- Vite 8
- PatternFly 6.6.1
- Vitest for unit tests
- Node.js server for production and API proxying
- Deployment support with Podman, Helm, and OpenShift

## Project structure

```text
.
├── src/
│   ├── App.tsx
│   ├── ConfigurationsPage.tsx
│   ├── DocumentDependenciesPage.tsx
│   ├── config/
│   ├── services/
│   └── ...
├── helm/
│   └── kubeoptix-dashboard/
├── Containerfile
├── server.mjs
├── vite.config.ts
├── package.json
├── .env.development
├── .env.openshift
├── install.sh
├── README.md
└── ...
```

## Prerequisites

- Node.js 20+ (or a version compatible with the project)
- npm
- Podman for container builds
- Helm and oc for OpenShift deployment

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Vite automatically loads `.env.development`. Open the URL shown by Vite, usually `http://localhost:5173`.

Available commands:

```bash
npm run dev       # Start Vite in development mode
npm run build     # Run type-check and generate dist/
npm run preview   # Preview the production build
npm run start     # Serve dist/ through server.mjs on port 8080
npm run test      # Run the Vitest suite
npm run lint      # Run oxlint
```

During development, the browser uses local frontend routes and Vite proxies upstream services without exposing their URLs to the client.

## Environment configuration

### Development variables

The expected values are in `.env.development`:

```env
ENV=development
HARVESTER_API_URL=https://harvester-shiftwise-ai.apps-crc.testing
ANALYZER_API_URL=https://analyzer-shiftwise-ai.apps-crc.testing
REPORTER_API_URL=https://reporter-shiftwise-ai.apps-crc.testing
CORE_AI_API_URL=https://core-ai-api-shiftwise-ai.apps-crc.testing
SETTINGS_API_URL=http://localhost:8000
TZ=UTC-3
```

`SETTINGS_API_URL` is optional in the development file because Vite defaults to `http://localhost:8000`, but it can be set explicitly when the configuration service runs on another host.

### OpenShift variables

The production image is configured through `.env.openshift`:

```env
ENV=openshift
HARVESTER_API_URL=http://harvester-api:8000
ANALYZER_API_URL=http://analyzer-api:8000
REPORTER_API_URL=http://reporter-api:8000
CORE_AI_API_URL=http://core-ai-api:8000
SETTINGS_API_URL=http://configurations-api:8000
TZ=America/Sao_Paulo
```

Internal services use short DNS names because the dashboard and APIs are deployed
in the same namespace (`shiftwise-ai`). Before exposing the dashboard, confirm
that all of these Services already exist in the namespace.

In the production server, `HARVESTER_API_URL` and `ANALYZER_API_URL` must be present because `server.mjs` constructs these URLs at startup. The other upstream URLs have container-friendly defaults, but defining all five explicitly is recommended.

## Production execution

The production server is implemented in `server.mjs`, serves the frontend from `dist/`, proxies APIs at runtime, and listens on `0.0.0.0:8080`. It exposes `/healthz`, returning `{ "status": "ok" }`, for readiness and liveness probes.

Build the application:

```bash
npm run build
```

Run the compiled application with the production server:

```bash
npm run start
```

The server does not load `.env` files by itself. Provide values at runtime through the shell, an environment manager, or an OpenShift/container `ConfigMap`.

## Container image

Build the container image:

```bash
podman build -t kubeoptix-dashboard -f Containerfile .
```

Run it locally with an environment file:

```bash
podman run --env-file .env -p 8080:8080 kubeoptix-dashboard
```

The image uses a two-stage UBI 10 build, runs the application as the non-root `kubeoptix` user, exposes port `8080`, and uses a read-only filesystem in the OpenShift workload.

## OpenShift deployment

The project includes a Helm chart in `helm/kubeoptix-dashboard` that creates:

- an `ImageStream` and binary `BuildConfig` for the `Containerfile`;
- a `ConfigMap` generated from the OpenShift environment file;
- a single-replica `StatefulSet` with probes on `/healthz`;
- a `Service` and an HTTPS `Route` with HTTP-to-HTTPS redirection;
- a `ValidatingAdmissionPolicy` and binding that prevent scaling below one replica.

The chart requires `.Values.environmentFile`. The `install.sh` script provides `.env.openshift` with `--set-file`, installs the build resources first, starts a binary build with `oc start-build`, and then installs the workload resources. The cluster must allow `BuildConfig`, `ImageStream`, `Route`, and admission policy resources in the `shiftwise-ai` namespace.

### OpenShift authentication

The chart publishes the application behind `quay.io/openshift/origin-oauth-proxy`,
using the `openshift` provider. The proxy redirects unauthenticated users to the
cluster's native OAuth flow and forwards only identity headers to the dashboard.
The dashboard never receives or stores the user's password or token.
Because the Route uses `edge` TLS termination, the proxy serves HTTP internally on
port 4180 and keeps its HTTPS listener disabled.
If the cluster version does not provide the default tag configured in the chart,
set `oauthProxy.image` to an `origin-oauth-proxy` image compatible with the
OpenShift version before deployment.

Configure the public Route host so that the OAuth callback can be validated:

```bash
helm upgrade --install kubeoptix-dashboard helm/kubeoptix-dashboard \
  --set-file environmentFile=.env.openshift \
  --set oauthProxy.routeHost=kubeoptix-dashboard-shiftwise-ai.apps.example.com
```

The `ServiceAccount` used by the proxy receives only the `system:auth-delegator`
permission required to validate identity through OpenShift OAuth. The chart creates
and preserves one proxy cookie secret and a separate secret for signing the
application's opaque session. Do not replace these values with user credentials.
The same `ServiceAccount` registers the Route as an `OAuthRedirectReference`,
allowing OpenShift OAuth to validate the `/oauth2/callback` callback.
Inside the pod, the dashboard listens only on `127.0.0.1`; the `oauth-proxy` is
the only container exposed by the `Service`. This prevents direct access to the
dashboard process from presenting forged identity headers.

The `GET /api/auth/session` and `POST /api/auth/logout` routes are also protected
by the OAuth Proxy, ensuring that the identity header is validated and injected
before reaching the backend. The session endpoint returns only `authenticated`,
`username`, and, when available, `displayName`; backend APIs return `401` when the
proxy identity header or linked session is invalid. The frontend checks the session
periodically and redirects to `/oauth2/start` when OpenShift authentication
expires. Local logout also redirects to `/oauth2/sign_out`.

The dashboard's opaque session is kept in memory, and the chart pins the
StatefulSet to one replica. Restarts invalidate local sessions and require new
proxy authentication; the persistent secret prevents accidental signing-secret
changes between restarts.

Install the chart:

```bash
./install.sh
```

The script requires `helm` and `oc`, access to the target OpenShift cluster, permission to create resources in `shiftwise-ai`, and a working internal registry/build configuration. To render or install manually, pass the environment file explicitly:

```bash
helm upgrade --install kubeoptix-dashboard helm/kubeoptix-dashboard \
  --namespace shiftwise-ai \
  --create-namespace \
  --set-file environmentFile=.env.openshift \
  --set buildOnly=false
```

Monitor the build and rollout:

```bash
oc logs -f bc/kubeoptix-dashboard -n shiftwise-ai
oc rollout status statefulset/kubeoptix-dashboard -n shiftwise-ai
```

Get the generated Route URL:

```bash
oc get route kubeoptix-dashboard -n shiftwise-ai \
  -o jsonpath='https://{.spec.host}{"\n"}'
```

## Validation

Run the automated checks:

```bash
npm run test
npm run build
npm run lint
```

These commands validate the frontend, service integration tests, build, and lint rules before deployment. For an OpenShift rollout, also verify readiness and the generated Route:

```bash
oc rollout status statefulset/kubeoptix-dashboard -n shiftwise-ai
oc get pods -n shiftwise-ai -l app.kubernetes.io/name=kubeoptix-dashboard
oc get route kubeoptix-dashboard -n shiftwise-ai \
  -o jsonpath='https://{.spec.host}{"\n"}'
```
