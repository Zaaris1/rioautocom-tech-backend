
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
- ACCESS_TOKEN_EXPIRE_MINUTES=1440

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
