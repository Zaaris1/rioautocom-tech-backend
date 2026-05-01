# Anexos de chamados no Google Drive usando OAuth

Esta versão usa OAuth da conta Google proprietária do Drive. Assim os arquivos enviados pelo app usam o armazenamento dessa conta, incluindo o plano Google One/Drive contratado.

## Variáveis obrigatórias no Render

No serviço do backend, configure:

```env
GOOGLE_DRIVE_AUTH_MODE=oauth
GOOGLE_DRIVE_FOLDER_ID=1W6BSp3ipj83dNoi6-wen-tupR6kBMk3J
GOOGLE_OAUTH_CLIENT_ID=<client_id_do_google_cloud>
GOOGLE_OAUTH_CLIENT_SECRET=<client_secret_do_google_cloud>
GOOGLE_OAUTH_REFRESH_TOKEN=<refresh_token_gerado_no_oauth_playground>
GOOGLE_DRIVE_PUBLIC_LINKS=true
MAX_IMAGE_MB=15
MAX_VIDEO_MB=90
MAX_ATTACHMENTS_PER_PHASE=5
```

## Variáveis antigas da conta de serviço

Com OAuth, estas configurações antigas não são mais necessárias:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=/etc/secrets/google-drive-service-account.json
GOOGLE_SERVICE_ACCOUNT_JSON=...
```

Elas podem ficar no Render sem atrapalhar se `GOOGLE_DRIVE_AUTH_MODE=oauth` estiver configurada, mas o ideal é removê-las depois que o upload estiver validado.

## Drive API

A Google Drive API precisa estar ativa no projeto do Google Cloud usado pelo OAuth Client.

## Pasta do Drive

A variável `GOOGLE_DRIVE_FOLDER_ID` deve apontar para a pasta raiz onde os anexos serão organizados.

A estrutura criada automaticamente será:

```txt
RioAutocom - Anexos dos Chamados
└── chamado-123
    ├── abertura
    └── fechamento
```

## Observação sobre Service Account

A conta de serviço foi abandonada para upload porque o Google retornou erro de cota:

```txt
Service Accounts do not have storage quota.
```

Com OAuth, o upload é feito em nome da conta Google autorizada e consome a cota dessa conta.
