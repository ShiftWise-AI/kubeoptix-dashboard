# Context: Node.js (Backend) + React (Frontend), independent folders, npm, Docker.

# Rules for Token Efficiency & Responses:
- Be concise. Give direct code solutions without long conceptual explanations.
- Focus only on the specific file or snippet provided in the prompt.
- If fixing an error, output only the corrected lines, not the whole file.
- Format responses cleanly. Avoid conversational small talk.

# Docker & Containerization Rules:
- Use multi-stage builds for React (e.g., build with Node, serve with Nginx).
- Optimize layers: copy `package*.json` and run `npm ci` before copying source.
- Use lightweight official images (`node:alpine` or `node:slim`).
- Always include a separate `.dockerignore` for each folder to skip node_modules.

# DevOps & Automation Rules:
- **Bash Scripts**: Follow Google Shell Style Guide. Use `set -euo pipefail`. Implement error handling and verbose logging for debugging.
- **Helm Charts**: Use standard folder structures (`templates/`, `values.yaml`). Prefer generating YAML manifests over complex logic. 
- **Kubernetes**: Focus on ConfigMaps, Secrets, and automated troubleshooting scripts.
- **Automation**: Minimize bash command failures by validating environment variables before execution.
