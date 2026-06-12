# RioAutocom tech — App único (PWA)

App único (cliente / técnico / admin). A UI muda conforme o `role` retornado no `/auth/login`.

## Rodar local
```bash
npm install
npm run dev
```

Opcional: crie um `.env` (copie de `.env.example`) e ajuste:
- `VITE_API_BASE=https://rioautocom-tech-backend.onrender.com`

## Instalar como App (PWA)
- Android (Chrome): menu ⋮ → **Adicionar à tela inicial**
- iPhone (Safari): compartilhar → **Adicionar à Tela de Início**

## Deploy rápido (Vercel)
- Suba este projeto no GitHub → importe no Vercel
- Em Environment Variables: `VITE_API_BASE = https://rioautocom-tech-backend.onrender.com`
