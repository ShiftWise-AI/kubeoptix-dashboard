# Contexto Tecnológico
- Stack: Node.js, React, TypeScript (estrito), JavaScript (ES6+).
- Infraestrutura: Podman (substituto do Docker), Helm, Kubernetes, OpenShift.

# Diretrizes de Código (Frontend e Backend)
- Use TypeScript estrito: evite 'any', sempre defina interfaces e tipos para Props e APIs.
- Em React: prefira Componentes Funcionais, Hooks customizados e gerenciamento de estado nativo.
- Em Node.js: utilize programação assíncrona (async/await) com tratamento explícito de erros.
- **Acessibilidade (a11y):** Garanta tags semânticas (`<main>`, `<section>`, `<nav>`) e atributos ARIA adequados em elementos interativos.
- **Tipografia Dinâmica:** Utilize classes responsivas do Tailwind ou funções matemáticas de CSS como `clamp()` para garantir legibilidade em qualquer tamanho de tela.
- **Micro-interações:** Adicione estados de hover, focus e transições suaves (`transition-all duration-200`) em todos os botões e links para dar uma sensação nativa e fluida à aplicação.

# Diretrizes de Containers e Orquestração (Podman/K8s/OpenShift)
- Dockerfiles: configure builds multi-stage otimizados para imagens seguras e sem root.
- Helm: separe os valores (`values.yaml`) das definições dos templates.
- OpenShift: priorize objetos de implantação nativos como 'DeploymentConfig' ou 'Route' em vez de Ingress, respeitando as restrições de segurança (SCC - Security Context Constraints).

# Formato das Respostas
- Responda de forma direta e forneça apenas trechos de código relevantes.
- Evite explicações teóricas longas sobre Kubernetes ou React, a menos que solicitado.


