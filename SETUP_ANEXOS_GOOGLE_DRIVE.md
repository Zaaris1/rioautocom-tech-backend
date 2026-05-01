# Configuração dos anexos no Google Drive

## Variáveis de ambiente no Render

Configure no serviço do backend:

```env
GOOGLE_DRIVE_FOLDER_ID=1W6BSp3ipj83dNoi6-wen-tupR6kBMk3J
GOOGLE_SERVICE_ACCOUNT_FILE=/etc/secrets/google-drive-service-account.json
GOOGLE_DRIVE_PUBLIC_LINKS=true
MAX_IMAGE_MB=10
MAX_VIDEO_MB=80
MAX_ATTACHMENTS_PER_PHASE=5
```

## Secret File no Render

Crie um Secret File chamado:

```txt
google-drive-service-account.json
```

Cole nele o conteúdo JSON da conta de serviço.

O Render disponibiliza esse arquivo em:

```txt
/etc/secrets/google-drive-service-account.json
```

## Observações

- A pasta do Drive precisa estar compartilhada com a conta de serviço como **Editor**.
- O backend cria subpastas automaticamente por chamado:
  - `chamado-<id>/abertura`
  - `chamado-<id>/fechamento`
- Por padrão, os arquivos enviados recebem permissão de leitura por link (`GOOGLE_DRIVE_PUBLIC_LINKS=true`) para que possam ser abertos pelo app.
- Não envie o JSON da conta de serviço para o GitHub.
