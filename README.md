# KubeOptix Dashboard

Dashboard web em React + TypeScript para operar o fluxo de avaliação do ShiftWise AI / KubeOptix. A interface coordena coleta de dados, análise, edição de relatórios, versionamento de documentos e configuração do sistema com PatternFly.

## Visão geral do fluxo

O fluxo principal foi desenhado para ser sequencial:

1. Configurações: cria o registro único de configurações do sistema, define idioma e método de extração padrão, configura campos de modelo e chave de API e, opcionalmente, faz upload de logotipo em PNG, JPEG, WEBP ou SVG (máximo 2 MB). O restante do fluxo operacional fica indisponível até que esse registro exista.
2. Harvester: seleciona namespaces, inicia a coleta da avaliação, acompanha o progresso, inspeciona a árvore coletada e remove dados quando necessário.
3. Analyzer: seleciona namespaces e executa análise generativa (LLM) ou preditiva (machine learning). Jobs longos são consultados até a conclusão.
4. Reports: revisa relatórios em Markdown gerados, edita o conteúdo, visualiza ou baixa o Markdown e salva versões do documento com metadados.

A tela de relatórios também gerencia listas de autores e clientes. Um documento pode ter vários autores e clientes; o cliente representa cada combinação autor/cliente como um registro de documento, mantendo um único relatório visível na lista. Relatórios salvos são marcados pela versão, enquanto rascunhos permanecem não salvos.

Ao salvar um documento, o dashboard grava o Markdown editado no serviço de reporter, cria os registros de documento/versão no serviço de configuração e remove o arquivo bruto do repositório de relatórios da IA. O documento salvo continua visível no banco de configuração. Ele também pode ser exportado em PDF; o dashboard rehidrata o arquivo antes de solicitar o endpoint de PDF do reporter quando a origem não está mais disponível em disco.

## Serviços de backend e rotas do proxy

O navegador chama apenas as rotas locais do dashboard. Em desenvolvimento, o Vite faz o proxy dessas requisições. Em produção, `server.mjs` executa o mesmo proxy em tempo de execução:

| Rota do dashboard | Responsabilidade upstream |
| --- | --- |
| `/api/harvester/*` e caminhos de coleta | Descoberta de namespaces, coleta, status e dados da avaliação |
| `/api/analyzer/*` | Análise generativa, status, namespaces e listagem de relatórios do analyzer |
| `/api/reporter/*` | Leitura/escrita de Markdown e renderização em PDF |
| `/api/core-ai/*` | Análise preditiva e operações da core AI |
| `/api/reports/*` | Status de relatórios da core AI e exclusão de arquivos |
| `/api/settings/*` | Configurações do sistema, logotipo, autores, clientes, documentos e versões |

O proxy mantém as URLs dos serviços upstream fora do navegador e fornece um único ponto de entrada para o frontend.

## Stack tecnológica

- React 19
- TypeScript em modo estrito
- Vite 8
- PatternFly 6.6.1
- Vitest para testes unitários
- Servidor Node.js para produção e proxy de APIs
- Suporte a implantação com Podman, Helm e OpenShift

## Estrutura do projeto

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

## Pré-requisitos

- Node.js 20+ (ou versão compatível com o projeto)
- npm
- Podman para builds de container
- Helm e oc para implantação em OpenShift

## Desenvolvimento local

Instale as dependências:

```bash
npm install
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O Vite carrega automaticamente `.env.development`. Abra a URL exibida pelo Vite, normalmente `http://localhost:5173`.

Comandos disponíveis:

```bash
npm run dev       # Inicia o Vite em modo de desenvolvimento
npm run build     # Realiza type-check e gera o dist/
npm run preview   # Visualiza a build de produção
npm run start     # Serve dist/ via server.mjs na porta 8080
npm run test      # Executa a suíte do Vitest
npm run lint      # Executa o oxlint
```

Em desenvolvimento, o navegador usa rotas locais do frontend e o Vite faz proxy para os serviços upstream sem expor suas URLs ao cliente.

## Configuração de ambiente

### Variáveis de desenvolvimento

Os valores esperados estão em `.env.development`:

```env
ENV=development
HARVESTER_API_URL=https://harvester-shiftwise-ai.apps-crc.testing
ANALYZER_API_URL=https://analyzer-shiftwise-ai.apps-crc.testing
REPORTER_API_URL=https://reporter-shiftwise-ai.apps-crc.testing
CORE_AI_API_URL=https://core-ai-api-shiftwise-ai.apps-crc.testing
SETTINGS_API_URL=http://localhost:8000
TZ=UTC-3
```

`SETTINGS_API_URL` é opcional no arquivo de desenvolvimento porque o Vite usa `http://localhost:8000` por padrão, mas pode ser definido explicitamente quando o serviço de configuração estiver em outro host.

### Variáveis do OpenShift

A imagem de produção é configurada por meio de `.env.openshift`:

```env
ENV=openshift
HARVESTER_API_URL=http://harvester-api:8000
ANALYZER_API_URL=http://analyzer-api:8000
REPORTER_API_URL=http://reporter-api:8000
CORE_AI_API_URL=http://core-ai-api:8000
SETTINGS_API_URL=http://configurations-api:8000
TZ=America/Sao_Paulo
```

Os serviços internos usam os nomes DNS curtos porque o dashboard e as APIs são
implantados no mesmo namespace (`shiftwise-ai`). Antes de disponibilizar o
dashboard, confirme que todos esses Services já existem no namespace.

No servidor de produção, `HARVESTER_API_URL` e `ANALYZER_API_URL` devem estar presentes porque `server.mjs` monta essas URLs na inicialização. As demais URLs upstream têm defaults amigáveis a contêineres, mas é recomendado definir as cinco explicitamente.

## Execução em produção

O servidor de produção está em `server.mjs`, serve o frontend em `dist/`, faz proxy das APIs em tempo de execução e escuta em `0.0.0.0:8080`. Ele expõe `/healthz`, retornando `{ "status": "ok" }`, para readiness e liveness probes.

Faça a build:

```bash
npm run build
```

Execute a aplicação compilada com o servidor de produção:

```bash
npm run start
```

O servidor não carrega arquivos `.env` por si só. Informe os valores em runtime via shell, gerenciador de ambiente ou `ConfigMap` do container/OpenShift.

## Imagem de container

Construa a imagem do container:

```bash
podman build -t kubeoptix-dashboard -f Containerfile .
```

Execute localmente com um arquivo de ambiente:

```bash
podman run --env-file .env -p 8080:8080 kubeoptix-dashboard
```

A imagem é construída em duas etapas a partir do UBI 10, serve a aplicação como usuário não-root `kubeoptix`, expõe a porta `8080` e usa filesystem somente leitura na carga de trabalho do OpenShift.

## Implantação no OpenShift

O projeto inclui um Helm chart em `helm/kubeoptix-dashboard` que cria:

- um `ImageStream` e um `BuildConfig` binário para o `Containerfile`;
- um `ConfigMap` gerado a partir do arquivo de ambiente do OpenShift;
- um `StatefulSet` de réplica única com probes em `/healthz`;
- um `Service` e uma `Route` HTTPS com redirecionamento HTTP-to-HTTPS;
- uma `ValidatingAdmissionPolicy` e binding que impedem redução para menos de uma réplica.

O chart exige `.Values.environmentFile`. O script `install.sh` fornece `.env.openshift` com `--set-file`, instala primeiro os recursos de build, inicia um build binário com `oc start-build` e depois instala os recursos da carga de trabalho. O cluster precisa permitir recursos de `BuildConfig`, `ImageStream`, `Route` e admission policy no namespace `shiftwise-ai`.

Instale o chart:

```bash
./install.sh
```

O script exige `helm` e `oc`, acesso ao cluster OpenShift alvo, permissão para criar recursos em `shiftwise-ai` e uma configuração funcional de registro interno/build. Para renderizar ou instalar manualmente, passe o arquivo de ambiente explicitamente:

```bash
helm upgrade --install kubeoptix-dashboard helm/kubeoptix-dashboard \
  --namespace shiftwise-ai \
  --create-namespace \
  --set-file environmentFile=.env.openshift \
  --set buildOnly=false
```

Acompanhe o build e o rollout:

```bash
oc logs -f bc/kubeoptix-dashboard -n shiftwise-ai
oc rollout status statefulset/kubeoptix-dashboard -n shiftwise-ai
```

Obtenha a URL da Route gerada:

```bash
oc get route kubeoptix-dashboard -n shiftwise-ai \
  -o jsonpath='https://{.spec.host}{"\n"}'
```

## Validação

Execute os checks automatizados:

```bash
npm run test
npm run build
npm run lint
```

Esses comandos validam o frontend, testes de integração de serviços, build e regras de lint antes do deploy. Para um rollout no OpenShift, também verifique readiness e a route gerada:

```bash
oc rollout status statefulset/kubeoptix-dashboard -n shiftwise-ai
oc get pods -n shiftwise-ai -l app.kubernetes.io/name=kubeoptix-dashboard
oc get route kubeoptix-dashboard -n shiftwise-ai \
  -o jsonpath='https://{.spec.host}{"\n"}'
```
