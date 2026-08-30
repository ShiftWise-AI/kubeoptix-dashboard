# KubeOptix Dashboard

React + TypeScript dashboard for operating the KubeOptix platform across harvester, analyzer, reporter, document versioning, and system settings workflows.

## Overview

This frontend exposes a PatternFly interface for:

- harvesting and reviewing assessment data;
- running analyzer jobs in `Generativa` and `Preditiva` modes;
- reviewing report documents and markdown content;
- managing document metadata, authors, customers, and PDF export;
- configuring system settings and branding assets;
- proxying backend APIs through a single secure entrypoint.

## Features

### Harvester

- list namespaces and available data sets;
- trigger collection with `POST /collect`;
- inspect collection status and progress;
- clean up assessment data with `DELETE /assessment`;
- browse the assessment file tree and rendered responses.

### Analyzer

- inspect namespaces for analyzer jobs;
- run analysis in `Generativa` mode via the analyzer service;
- run predictive analysis via the core AI service;
- check status and list generated reports;
- delete generated report artifacts.

### Reports and document workflow

- list markdown reports from the reporter service;
- open the report preview in markdown format;
- save and version document metadata in the settings/configuration API;
- manage authors and customers used by document generation;
- export the saved document to PDF.

### Configuration and branding

- manage system settings and language defaults;
- store API keys and model selection;
- upload or remove the custom organization logo;
- keep the current settings synchronized with the backend.

## Tech stack

- React 19
- TypeScript
- Vite
- PatternFly 6.6.1
- Vitest for unit tests
- Node.js server for production proxying

## Project structure

```text
.
├── src/
│   ├── App.tsx
│   ├── ConfigurationsPage.tsx
│   ├── DocumentDependenciesPage.tsx
│   ├── services/
│   ├── config/
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

The Vite app loads `.env.development` automatically. In development, browser requests are routed through local frontend endpoints and proxied to the upstream services without exposing direct backend access from the browser.

## Environment configuration

### Development variables

The expected values are defined in `.env.development`:

```env
ENV=development
HARVESTER_API_URL=https://harvester-shiftwise-ai.apps-crc.testing
ANALYZER_API_URL=https://analyzer-shiftwise-ai.apps-crc.testing
REPORTER_API_URL=https://reporter-shiftwise-ai.apps-crc.testing
CORE_AI_API_URL=https://core-ai-api-shiftwise-ai.apps-crc.testing
TZ=UTC-3
```

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

The app also supports runtime proxying for:

- `/api/harvester/*`
- `/api/analyzer/*`
- `/api/reporter/*`
- `/api/core-ai/*`
- `/api/reports`
- `/api/settings/*`

## Production runtime

The production server is implemented in `server.mjs` and serves the built frontend while proxying backend APIs at runtime. It exposes `/healthz` for readiness checks.

Build the app:

```bash
npm run build
```

Run the compiled app locally with the production server:

```bash
npm run start
```

The server expects the runtime environment values to be available in the process environment, typically via a `.env` file or Kubernetes/OpenShift secret/config map.

## Container image

Build the container image:

```bash
podman build -t kubeoptix-dashboard -f Containerfile .
```

Run it locally with an environment file:

```bash
podman run --env-file .env -p 8080:8080 kubeoptix-dashboard
```

## OpenShift deployment

The project includes a Helm chart under `helm/kubeoptix-dashboard` that creates the required OpenShift resources:

- `ImageStream` and `BuildConfig` from the repository source;
- `ConfigMap` from the OpenShift environment file;
- single-replica `StatefulSet`;
- `Service` and HTTPS `Route` with HTTP redirect;
- `ValidatingAdmissionPolicy` preventing scale changes away from one replica.

The chart expects the installation namespace to already include the `github-auth` secret required by the build pipeline. The cluster must also allow creation of the admission policy resources.

Install the chart:

```bash
./install.sh
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
```

These commands verify the current frontend and service integration logic before deployment.

