# Sistema de Gestao de Pacientes (Enfermagem + ACS)

MVP inicial para:
- Cadastro de pacientes
- Registro de atendimentos
- Criação e acompanhamento de tarefas para ACS
- Mural de comunicação por paciente
- Filtro de pacientes por microárea e ACS
- Auditoria basica das alteracoes
- Categorização clínica (gestante, puérpera, rastreamento feminino/trans, puericultura, idosa, crônicos etc.)
- Histórico clínico completo com visitas, consultas, vacinas e procedimentos
- Resumo de protocolo com metas x realizado
- IA assistida para equipe e paciente (resumo, alertas, priorização, chat, relat?rios)

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
- `frontend/config.prod.example.js` (URL da API em produção)

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
- Enfermeira (conta inicial): `ana@clinica.local` / `123456`
- ACS, Médica e Enfermeiro(a) gestor(a): podem criar conta na tela inicial (`POST /auth/register`)
- Regras de cadastro:
  - Médica e Enfermeiro(a) precisam informar conselho (número + UF)
  - Conselho é validado (dígitos, UF, faixa de tamanho por tipo e bloqueio de sequências/repeti??es) e não pode duplicar
  - Enfermeiro(a) gestor(a) cria uma nova equipe no cadastro
  - ACS e Médica entram em uma equipe existente

## Equipes
- Todos os dados são separados por equipe.
- Cada equipe e vinculada a uma enfermeira.
- Usuários s? acessam pacientes, tarefas e registros da própria equipe.

## Autenticação e permissão
- Autenticação via JWT (`POST /auth/login` retorna `token`).
- Rotas de dados exigem `Authorization: Bearer <token>`.
- Perfil `nurse_manager` (enfermeira):
  - cria/edita paciente
  - cria tarefa para ACS
  - cria atendimentos
  - atualiza tarefas
  - visualiza auditoria
- Perfil `doctor` (médica):
  - visualiza pacientes
  - cria atendimento
  - registra consulta, vacina, procedimento e observação
- Perfil `acs`:
  - visualiza apenas pacientes atribuidos a ele
  - atualiza apenas o `status` das tarefas atribuidas a si
  - registra visita e observação no histórico clinico
  - envia mensagens no mural do paciente

## Categorias clinicas e protocolo
- Cada paciente pode ser classificado por categoria de cuidado:
  - `general`, `pregnant`, `puerperal`, `pap_only`, `child_followup`, `chronic`, `elderly`
- O sistema possui templates de protocolo por categoria (metas de visitas, consultas e vacinas).
- O resumo de protocolo consolida:
  - total realizado de visitas, consultas e vacinas
  - pendências em relação ao protocolo
  - checklist de vacinas recomendadas

## Variavel de ambiente (opcional)
- `JWT_SECRET`: chave usada para assinar tokens.
- Se não informar, a API usa uma chave padr?o de desenvolvimento.
- `NODE_ENV`: use `production` em produção.
- `FRONTEND_ORIGINS`: lista CSV de origens permitidas (CORS), ex: `https://app.exemplo.com`.
- `AUTH_RATE_LIMIT_WINDOW_MS`: janela de limitação de tentativas de autenticacao (ms).
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS`: maximo de tentativas por IP na janela.

## Seguranca e LGPD (baseline tecnico)
- Senhas são armazenadas com hash (`scrypt`) e migradas automaticamente se legadas em texto puro.
- JWT exige segredo forte em produção (`JWT_SECRET` obrigatorio).
- CORS restrito por allowlist via `FRONTEND_ORIGINS`.
- Rotas de login/registro possuem limitação de tentativas por IP.
- Headers de seguranca HTTP basicos habilitados (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- Auditoria de acoes criticas habilitada para rastreabilidade.

## Governança recomendada (operação real)
- Definir base legal e finalidade por dado coletado (minimização obrigatoria).
- Nomear encarregado (DPO) e manter canal de atendimento ao titular.
- Publicar politica de privacidade e termos de us? internos.
- Implementar rotina de direitos do titular: acesso, correção, eliminação e portabilidade.
- Definir prazo de retencao e descarte seguro por tipo de registro.
- Manter controle de incidentes com plano de resposta e notificação.
- Restringir acess? por perfil, revisar logs periodicamente e registrar consentimentos quando aplicavel.

## Integração externa de conselho (ja acoplada)
- O cadastro ja faz chamada para um provedor externo de validação de conselho.
- Configurar no backend (`backend/.env.example`):
  - `COUNCIL_VERIFY_MODE`: `off`, `optional` ou `required`
  - `COUNCIL_VERIFY_PROVIDER`: `generic`, `n8n` ou `make`
  - `COUNCIL_VERIFY_URL`
  - `COUNCIL_VERIFY_TOKEN`
  - `COUNCIL_VERIFY_TIMEOUT_MS`
- Recomendado para produção: `COUNCIL_VERIFY_MODE=required`
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
- `GET /metrics/demand/monthly` (enfermeira e médica)
- `GET /patients/:id/history`
- `GET /patients/:id/protocol-summary`
- `POST /patients/:id/records`
- `GET/POST/PATCH /tasks`
- `GET/POST /patients/:id/messages`
- `GET /audit-logs` (somente enfermeira)
- `GET /privacy/requests` (somente enfermeira)
- `POST /privacy/requests` (somente enfermeira)
- `PATCH /privacy/requests/:id` (somente enfermeira)
- `POST /privacy/requests/:id/execute` (somente enfermeira)
- `POST /privacy/retention/anonymize` (somente enfermeira)
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

## Indicador mensal de demanda
- Nos atendimentos (`POST /patients/:id/appointments`), use `demandType`:
  - `scheduled` para demanda programada/agendada
  - `spontaneous` para demanda espontânea
- Fórmula mensal monitorada:
  - `(atendimentos programados / total de atendimentos) * 100`
- Faixa esperada:
  - entre `50%` e `70%` (com alerta quando fora)

## Proximos passos sugeridos
- Banco de dados real (PostgreSQL)
- Edi??o de cadastro do paciente na tela
- Dashboard de indicadores por microárea/ACS
- Prontuário com anexos e exportação PDF

