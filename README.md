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

The Vite dev server proxies API calls to:

- `https://harvester-shiftwise-ai.apps-crc.testing`
- `https://analyzer-shiftwise-ai.apps-crc.testing`

Proxy paths used by the frontend:

- `/api/harvester/*`
- `/api/analyzer/*`

## Environment overrides

You can override proxy targets with:

- `VITE_HARVESTER_API`
- `VITE_ANALYZER_API`

Example:

```bash
VITE_HARVESTER_API=https://my-harvester.example.com \
VITE_ANALYZER_API=https://my-analyzer.example.com \
npm run dev
```
