
# RioAutocom Tech — Backend FINAL (MVP completo)

API para:
- Admin Web (gestão)
- App Técnico (atendimento)
- App Cliente (consulta)

## Stack
- FastAPI
- PostgreSQL (Neon)
- SQLAlchemy 2.x
- JWT
- Driver Postgres: psycopg (v3) — compatível com Python 3.13 (Render)

## Admin inicial (seed)
- username: admin
- password: 040126

> Recomendação: após logar, use `/auth/change-password` e troque a senha do admin.

## Variáveis de ambiente (Render)
Obrigatórias:
- DATABASE_URL  (string do Neon; pode ser `postgresql://...`)
- SECRET_KEY    (chave do JWT)

Opcionais:
- ALGORITHM=HS256
- ACCESS_TOKEN_EXPIRE_MINUTES=259200  # 180 dias
- ou ACCESS_TOKEN_EXPIRE_DAYS=180

## Deploy no Render
Build Command:
```
pip install -r requirements.txt
```
Start Command:
```
uvicorn app.main:app --host 0.0.0.0 --port 10000
```

## Regras do seu negócio (implementadas)
- Cliente só consulta (não cria/edita chamados).
- Chamado só é criado por ADMIN.
- Técnico pode:
  - ver ABERTO (fila) e assumir (vira ATRIBUIDO)
  - iniciar (EM_ATENDIMENTO)
  - pendenciar (PENDENTE)
  - concluir (CONCLUIDO) **somente com parecer obrigatório**
- Tudo gera `ticket_updates` (auditoria).

## Convenções
Status:
- ABERTO
- ATRIBUIDO
- EM_ATENDIMENTO
- PENDENTE
- CONCLUIDO
- CANCELADO

Prioridade:
- Normal
- Urgente

Tipo:
- Reparo
- Instalação
- Serviço
- Visita técnica

## Atualização 1.1.0 — Base profissional, migrations e segurança

Esta versão adiciona uma primeira camada de hardening para produção:

- Alembic no backend para versionar alterações de banco.
- Migration inicial `20260610_0001_base_hardening`.
- Nova coluna `stores.cnpj_digits` para normalizar CNPJ somente com números.
- Busca de monitoramento por CNPJ normalizado, sem depender de máscara.
- Constraints básicas para `role`, `ticket.type`, `ticket.priority` e `ticket.status`.
- CORS configurável por variável de ambiente.
- Bloqueio de navegação/API quando `must_change_password=True`, liberando apenas `/auth/change-password` e `/auth/refresh`.
- `AUTO_CREATE_TABLES` agora fica desativado por padrão para evitar mudanças não versionadas em produção.

### Variáveis recomendadas no Render

```env
RUN_MIGRATIONS_ON_STARTUP=true
STRICT_MIGRATIONS=false
AUTO_CREATE_TABLES=false
SEED_ON_STARTUP=true
CORS_ORIGINS=https://SEU-FRONTEND.vercel.app,https://app.rioautocom.com.br
```

Se estiver subindo um banco novo do zero, use temporariamente:

```env
AUTO_CREATE_TABLES=true
```

Depois do primeiro deploy e criação das tabelas, volte para:

```env
AUTO_CREATE_TABLES=false
```
