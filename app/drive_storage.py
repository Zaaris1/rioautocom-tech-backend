import io
import json
import os
import re
from functools import lru_cache
from typing import Dict, Optional

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]
FOLDER_MIME = "application/vnd.google-apps.folder"


def _auth_mode() -> str:
    return os.getenv("GOOGLE_DRIVE_AUTH_MODE", "service_account").strip().lower() or "service_account"


def _service_account_info() -> Dict:
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        return json.loads(raw_json)

    path = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "/etc/secrets/google-drive-service-account.json")
    if not path or not os.path.exists(path):
        raise RuntimeError(
            "Credencial do Google Drive não encontrada. Configure GOOGLE_SERVICE_ACCOUNT_FILE "
            "ou GOOGLE_SERVICE_ACCOUNT_JSON."
        )

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _oauth_credentials() -> Credentials:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    refresh_token = os.getenv("GOOGLE_OAUTH_REFRESH_TOKEN", "").strip()

    missing = []
    if not client_id:
        missing.append("GOOGLE_OAUTH_CLIENT_ID")
    if not client_secret:
        missing.append("GOOGLE_OAUTH_CLIENT_SECRET")
    if not refresh_token:
        missing.append("GOOGLE_OAUTH_REFRESH_TOKEN")

    if missing:
        raise RuntimeError("Configuração OAuth do Google Drive incompleta: " + ", ".join(missing))

    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )


@lru_cache(maxsize=1)
def get_drive_service():
    mode = _auth_mode()

    if mode == "oauth":
        creds = _oauth_credentials()
    else:
        info = _service_account_info()
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)

    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _escape_query(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


def _safe_name(value: str, fallback: str = "arquivo") -> str:
    raw = str(value or fallback).strip() or fallback
    raw = re.sub(r"[\\/:*?\"<>|]+", "-", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:160] or fallback


def get_or_create_folder(parent_id: str, name: str) -> str:
    service = get_drive_service()
    safe_name = _safe_name(name, "pasta")
    q = (
        f"mimeType='{FOLDER_MIME}' and name='{_escape_query(safe_name)}' "
        f"and '{_escape_query(parent_id)}' in parents and trashed=false"
    )
    res = service.files().list(q=q, fields="files(id,name)", pageSize=1, supportsAllDrives=True).execute()
    files = res.get("files") or []
    if files:
        return files[0]["id"]

    meta = {"name": safe_name, "mimeType": FOLDER_MIME, "parents": [parent_id]}
    created = service.files().create(body=meta, fields="id", supportsAllDrives=True).execute()
    return created["id"]


def upload_ticket_file(
    *,
    ticket_id: str,
    phase: str,
    filename: str,
    mime_type: str,
    data: bytes,
    ticket_folder_name: Optional[str] = None,
) -> Dict[str, Optional[str]]:
    root_folder = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    if not root_folder:
        raise RuntimeError("GOOGLE_DRIVE_FOLDER_ID não configurado.")

    service = get_drive_service()
    ticket_folder = get_or_create_folder(root_folder, ticket_folder_name or f"chamado-{ticket_id}")
    phase_folder = get_or_create_folder(ticket_folder, "abertura" if phase == "ABERTURA" else "fechamento")

    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mime_type, resumable=False)
    meta = {"name": _safe_name(filename), "parents": [phase_folder]}
    uploaded = service.files().create(
        body=meta,
        media_body=media,
        fields="id,name,webViewLink,webContentLink",
        supportsAllDrives=True,
    ).execute()

    make_public = os.getenv("GOOGLE_DRIVE_PUBLIC_LINKS", "true").strip().lower() not in ("0", "false", "no", "n")
    if make_public:
        try:
            service.permissions().create(
                fileId=uploaded["id"],
                body={"type": "anyone", "role": "reader"},
                fields="id",
                supportsAllDrives=True,
            ).execute()
            uploaded = service.files().get(
                fileId=uploaded["id"],
                fields="id,name,webViewLink,webContentLink",
                supportsAllDrives=True,
            ).execute()
        except Exception:
            # O upload continua válido mesmo se a criação do link público falhar.
            pass

    return {
        "drive_file_id": uploaded.get("id"),
        "drive_view_link": uploaded.get("webViewLink"),
        "drive_download_link": uploaded.get("webContentLink"),
    }
