# Sistema de Gestao de Pacientes (Enfermagem + ACS)

MVP inicial para:
- Cadastro de pacientes
- Registro de atendimentos
- Criacao e acompanhamento de tarefas para ACS
- Mural de comunicacao por paciente
- Filtro de pacientes por microarea e ACS
- Auditoria basica das alteracoes
- Categorizacao clinica (gestante, puerpera, preventivo/Papanicolau etc.)
- Historico clinico completo com visitas, consultas, vacinas e procedimentos
- Resumo de protocolo com metas x realizado
- IA assistida para equipe e paciente (resumo, alertas, priorizacao, chat, relatorios)

## Tecnologias
- Backend: Node.js + Express
- Persistencia: arquivo JSON local (`backend/data/db.json`)
- Frontend: HTML, CSS e JavaScript puro

## Como executar

1. Subir a API:
```powershell
cd backend
npm install
npm run dev
```

2. Em outro terminal, subir o frontend:
```powershell
cd frontend
python -m http.server 5500
```

3. Abrir no navegador:
- `http://localhost:5500`

## Publicar online (gratis)
Arquitetura recomendada para custo zero inicial:
1. Backend no Render (web service free)
2. Banco no Neon (Postgres free)
3. Frontend no Cloudflare Pages (free)

Arquivos de apoio ja prontos:
- `render.yaml` (deploy do backend)
- `backend/.env.example` (variaveis necessarias)
- `frontend/config.prod.example.js` (URL da API em producao)

### Backend (Render + Neon)
1. Criar banco no Neon e copiar `DATABASE_URL`.
2. Subir este repositorio no GitHub.
3. No Render, criar web service a partir do repo (ou Blueprint com `render.yaml`).
4. Definir env vars no Render:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `COUNCIL_VERIFY_MODE=required`
   - `COUNCIL_VERIFY_PROVIDER=n8n` (ou `make`)
   - `COUNCIL_VERIFY_URL`
   - `COUNCIL_VERIFY_TOKEN`
5. Confirmar `GET /health` e `GET /integrations/council/status`.

### Frontend (Cloudflare Pages)
1. Publicar pasta `frontend` no Cloudflare Pages.
2. Copiar `frontend/config.prod.example.js` para `frontend/config.js` antes do deploy.
3. Ajustar `apiUrl` para a URL publica do backend (Render).
4. Validar no celular e desktop acessando a URL do Pages.

## Logins e cadastro
- Enfermeira gestora (conta inicial): `ana@clinica.local` / `123456`
- ACS, Medica e Enfermeiro(a) gestor(a): podem criar conta na tela inicial (`POST /auth/register`)
- Regras de cadastro:
  - Medica e Enfermeiro(a) precisam informar conselho (numero + UF)
  - Conselho e validado (digitos, UF, faixa de tamanho por tipo e bloqueio de sequencias/repeticoes) e nao pode duplicar
  - Enfermeiro(a) gestor(a) cria uma nova equipe no cadastro
  - ACS e Medica entram em uma equipe existente

## Equipes
- Todos os dados sao separados por equipe.
- Cada equipe e vinculada a uma enfermeira gestora.
- Usuarios so acessam pacientes, tarefas e registros da propria equipe.

## Autenticacao e permissao
- Autenticacao via JWT (`POST /auth/login` retorna `token`).
- Rotas de dados exigem `Authorization: Bearer <token>`.
- Perfil `nurse_manager` (enfermeira gestora):
  - cria/edita paciente
  - cria tarefa para ACS
  - cria atendimentos
  - atualiza tarefas
  - visualiza auditoria
- Perfil `doctor` (medica):
  - visualiza pacientes
  - cria atendimento
  - registra consulta, vacina, procedimento e observacao
- Perfil `acs`:
  - visualiza apenas pacientes atribuidos a ele
  - atualiza apenas o `status` das tarefas atribuidas a si
  - registra visita e observacao no historico clinico
  - envia mensagens no mural do paciente

## Categorias clinicas e protocolo
- Cada paciente pode ser classificado por categoria de cuidado:
  - `general`, `pregnant`, `puerperal`, `pap_only`, `child_followup`, `chronic`
- O sistema possui templates de protocolo por categoria (metas de visitas, consultas e vacinas).
- O resumo de protocolo consolida:
  - total realizado de visitas, consultas e vacinas
  - pendencias em relacao ao protocolo
  - checklist de vacinas recomendadas

## Variavel de ambiente (opcional)
- `JWT_SECRET`: chave usada para assinar tokens.
- Se nao informar, a API usa uma chave padrao de desenvolvimento.

## Integracao externa de conselho (ja acoplada)
- O cadastro ja faz chamada para um provedor externo de validacao de conselho.
- Configurar no backend (`backend/.env.example`):
  - `COUNCIL_VERIFY_MODE`: `off`, `optional` ou `required`
  - `COUNCIL_VERIFY_PROVIDER`: `generic`, `n8n` ou `make`
  - `COUNCIL_VERIFY_URL`
  - `COUNCIL_VERIFY_TOKEN`
  - `COUNCIL_VERIFY_TIMEOUT_MS`
- Recomendado para producao: `COUNCIL_VERIFY_MODE=required`
- Exemplo pronto de payload/resposta: `backend/integrations/council-webhook-example.json`
- Template importavel do n8n (mock funcional): `backend/integrations/n8n-workflow-template.json`
- Payload enviado para o provedor:
  - `role`, `councilType`, `councilNumber`, `councilUf`, `name`, `email`
- Respostas aceitas:
  - `generic`: `{ "valid": true|false }`
  - `n8n`: `{ "valid": true }`, `{ "approved": true }` ou `{ "status": "approved" }`
  - `make`: `{ "result": { "is_valid": true } }` ou `{ "result": { "outcome": "approved" } }`

## Endpoints principais
- `POST /auth/login`
- `POST /auth/register`
- `GET /teams/public`
- `GET /integrations/council/status`
- `GET /protocol/templates`
- `GET/POST /patients`
- `PUT /patients/:id`
- `GET/POST /patients/:id/appointments`
- `GET /patients/:id/history`
- `GET /patients/:id/protocol-summary`
- `POST /patients/:id/records`
- `GET/POST/PATCH /tasks`
- `GET/POST /patients/:id/messages`
- `GET /audit-logs` (somente enfermeira)
- `GET /ai/status`
- `POST /ai/patients/:id/summary`
- `POST /ai/patients/:id/protocol-highlights`
- `POST /ai/patients/:id/evolution-draft`
- `POST /ai/patients/:id/acs-message`
- `POST /ai/patients/:id/suggest-category`
- `POST /ai/patients/:id/transcribe`
- `POST /ai/team/priorities`
- `POST /ai/team/data-quality`
- `POST /ai/team/report` (somente enfermeira)
- `POST /ai/chat`

## Proximos passos sugeridos
- Banco de dados real (PostgreSQL)
- Edicao de cadastro do paciente na tela
- Dashboard de indicadores por microarea/ACS
- Prontuario com anexos e exportacao PDF
