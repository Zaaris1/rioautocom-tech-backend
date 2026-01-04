
# RioAutocom Tech - Backend MVP v4

MVP completo (endpoints + RBAC) para:
- Admin Web
- App Técnico
- App Cliente (consulta)

## Stack
- FastAPI
- PostgreSQL (Neon)
- SQLAlchemy
- JWT

## Admin inicial
username: admin
password: 040126

## Rodar local
1) python -m venv .venv
2) .venv\Scripts\activate  (Windows)
3) pip install -r requirements.txt
4) copie .env.example -> .env e ajuste DATABASE_URL/SECRET_KEY
5) uvicorn app.main:app --reload

## Deploy (Render)
Build: pip install -r requirements.txt
Start: uvicorn app.main:app --host 0.0.0.0 --port 10000

Env vars mínimas:
- DATABASE_URL
- SECRET_KEY
- ALGORITHM=HS256
- ACCESS_TOKEN_EXPIRE_MINUTES=1440

## Notas
- Cliente loga com CNPJ como `username` e senha inicial `402365` (admin cria cliente).
- Técnico loga com `username` e senha definida pelo admin.
- Técnico só conclui com parecer obrigatório (>=15 chars).
