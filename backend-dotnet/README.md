# Backend .NET (migracao inicial)

Este backend roda em paralelo ao Node para migracao gradual, sem quebrar a operacao atual.

## O que ja foi implementado

- `POST /auth/login`
- `GET /me`
- `GET /patients`
- `POST /patients`
- `GET /patients/{id}/history`
- `GET /patients/{id}/protocol-summary`
- `GET /health`

## Fonte de dados (fase atual)

Na fase inicial, o projeto le o mesmo arquivo JSON do backend atual:

- padrao: `backend/data/db.json`
- opcional: definir `DB_JSON_PATH`

## Variaveis de ambiente

- `JWT_SECRET` (obrigatorio em producao)
- `JWT_ISSUER` (default: `saudeubs-backend`)
- `JWT_AUDIENCE` (default: `saudeubs-client`)
- `JWT_EXPIRES_HOURS` (default: `12`)
- `DB_JSON_PATH` (opcional)

## Executar localmente

```powershell
dotnet restore backend-dotnet/SaudeUbs.Api/SaudeUbs.Api.csproj
dotnet run --project backend-dotnet/SaudeUbs.Api/SaudeUbs.Api.csproj
```

## Observacoes da fase 1

- Objetivo: espelhar contrato principal para homologacao.
- Hash `s1$...` (scrypt do Node) ainda nao foi portado nesta fase.
- Proximos passos:
  1. portar validacao de hash scrypt para manter compatibilidade total de login;
  2. portar `PUT /patients/{id}` e demais endpoints clinicos;
  3. trocar persistencia de JSON para PostgreSQL com EF Core;
  4. ativar testes automatizados de regressao de protocolo.

