# KubeOptix Dashboard

React + TypeScript web application for operating the ShiftWise AI / KubeOptix assessment workflow. The dashboard coordinates data collection, analysis, report editing, document versioning, and system configuration through a PatternFly interface.

## How the application works

The main workflow is intentionally sequential:

1. **Configurations**: create the single system-settings record, choose the language and default extraction method, configure model/API-key fields, and optionally upload a PNG, JPEG, WEBP, or SVG logo (maximum 2 MB). The operational workflow remains unavailable until this record exists.
2. **Harvester**: select namespaces, start an assessment collection, monitor progress, inspect the collected assessment tree, and delete assessment data when required.
3. **Analyzer**: select namespaces and run either generative analysis (LLM) or predictive analysis (machine learning). Long-running jobs are polled until completion.
4. **Reports**: review generated Markdown reports, edit their content, preview or download Markdown, and save document versions with metadata.

The Reports screen also manages authors and customer lists. A document can use multiple authors and customers; the client represents each author/customer combination as a document record while keeping one report visible in the list. Saved reports are marked with their version, while unsaved reports remain drafts.

Saving a document writes the edited Markdown to the reporter service, creates the document/version records in the configuration service, and then removes the raw report file from the core AI report store. The saved document remains visible from the configuration database. A saved document can be exported as PDF; the dashboard rehydrates the report file before requesting the reporter PDF endpoint when the source file is no longer on disk.

## Backend services and proxy paths

The browser only calls the dashboard's local paths. In development, Vite proxies these requests. In production, `server.mjs` performs the same proxying at runtime:

| Dashboard path | Upstream responsibility |
| --- | --- |
| `/api/harvester/*` and collection paths | Namespace discovery, collection, status, and assessment data |
| `/api/analyzer/*` | Generative analysis, status, namespaces, and analyzer report listing |
| `/api/reporter/*` | Markdown read/write and PDF rendering |
| `/api/core-ai/*` | Predictive analysis and core AI operations |
| `/api/reports/*` | Core AI report status and report-file deletion |
| `/api/settings/*` | System settings, logo, authors, customer lists, documents, and versions |

The proxy keeps upstream service URLs out of browser requests and provides one frontend entrypoint for the deployment.

## Tech stack

- React 19
- TypeScript in strict mode
- Vite 8
- PatternFly 6.6.1
- Vitest for unit tests
- Node.js production server and API proxy
- Podman, Helm, and OpenShift deployment support

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

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The Vite app loads `.env.development` automatically. Open the URL printed by Vite, normally `http://localhost:5173`.

Available commands:

```bash
npm run dev       # Start Vite in development mode
npm run build     # Type-check and create dist/
npm run preview   # Preview the Vite production build
npm run start     # Serve dist/ through server.mjs on port 8080
npm run test      # Run the Vitest suite once
npm run lint      # Run oxlint
```

In development, the browser uses local frontend paths and Vite proxies requests to the upstream services without exposing their URLs to the client.

## Environment configuration

### Development variables

The expected values are defined in `.env.development`:

```env
ENV=development
HARVESTER_API_URL=https://harvester-shiftwise-ai.apps-crc.testing
ANALYZER_API_URL=https://analyzer-shiftwise-ai.apps-crc.testing
REPORTER_API_URL=https://reporter-shiftwise-ai.apps-crc.testing
CORE_AI_API_URL=https://core-ai-api-shiftwise-ai.apps-crc.testing
SETTINGS_API_URL=http://localhost:8000
TZ=UTC-3
```

`SETTINGS_API_URL` is optional in the checked-in development file because Vite defaults it to `http://localhost:8000`, but it can be set explicitly when the configuration service is running elsewhere.

### OpenShift variables

The production image is configured via `.env.openshift`:

```env
ENV=openshift
HARVESTER_API_URL=http://harvester-api:8000
ANALYZER_API_URL=http://analyzer-api:8000
REPORTER_API_URL=http://reporter-api:8000
CORE_AI_API_URL=http://core-ai-api.shiftwise-ai.svc.cluster.local:8000
SETTINGS_API_URL=http://configurations-api:8000
TZ=America/Sao_Paulo
```

For the production server, `HARVESTER_API_URL` and `ANALYZER_API_URL` must be present because `server.mjs` constructs those URLs at startup. The other upstream URLs have container-friendly defaults, but setting all five explicitly is recommended.

## Production runtime

The production server is implemented in `server.mjs`, serves the `dist/` frontend, proxies backend APIs at runtime, and listens on `0.0.0.0:8080`. It exposes `/healthz`, returning `{ "status": "ok" }`, for readiness and liveness probes.

Build the app:

```bash
npm run build
```

Run the compiled app locally with the production server:

```bash
npm run start
```

The server does not load `.env` files by itself. Provide runtime values through the shell, an environment manager, or a container/OpenShift `ConfigMap`.

## Container image

Build the container image:

```bash
podman build -t kubeoptix-dashboard -f Containerfile .
```

Run it locally with an environment file:

```bash
podman run --env-file .env -p 8080:8080 kubeoptix-dashboard
```

The image is built in two stages from UBI 10, serves the compiled app as the non-root `kubeoptix` user, exposes port `8080`, and uses a read-only root filesystem in the OpenShift workload.

## OpenShift deployment

The project includes a Helm chart under `helm/kubeoptix-dashboard` that creates:

- an `ImageStream` and binary `BuildConfig` for the `Containerfile`;
- a `ConfigMap` generated from the supplied OpenShift environment file;
- a single-replica `StatefulSet` with `/healthz` probes;
- a `Service` and HTTPS `Route` with HTTP-to-HTTPS redirect;
- a `ValidatingAdmissionPolicy` and binding that prevent scaling away from one replica.

The chart requires `.Values.environmentFile`. The included `install.sh` supplies `.env.openshift` with `--set-file`, first installs the build-only resources, starts a binary build with `oc start-build`, and then installs the workload resources. The cluster must allow `BuildConfig`, `ImageStream`, `Route`, and admission-policy resources in the `shiftwise-ai` namespace.

Install the chart:

```bash
./install.sh
```

The script requires `helm` and `oc`, access to the target OpenShift cluster, permission to create resources in `shiftwise-ai`, and a working internal registry/build configuration. To render or install the chart manually, pass the environment file explicitly:

```bash
helm upgrade --install kubeoptix-dashboard helm/kubeoptix-dashboard \
  --namespace shiftwise-ai \
  --create-namespace \
  --set-file environmentFile=.env.openshift \
  --set buildOnly=false
```

Watch the build and rollout:

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

These commands verify the frontend, service integration tests, type-check/build output, and lint rules before deployment. For an OpenShift rollout, also verify readiness and the generated route:

```bash
oc rollout status statefulset/kubeoptix-dashboard -n shiftwise-ai
oc get pods -n shiftwise-ai -l app.kubernetes.io/name=kubeoptix-dashboard
oc get route kubeoptix-dashboard -n shiftwise-ai \
  -o jsonpath='https://{.spec.host}{"\n"}'
```

