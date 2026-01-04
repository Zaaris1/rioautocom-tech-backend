from fastapi import APIRouter, HTTPException
router = APIRouter()

@router.post("/{ticket_id}/close")
def close_ticket(ticket_id: str, resolution_text: str):
    if not resolution_text or len(resolution_text.strip()) < 15:
        raise HTTPException(status_code=422, detail="Parecer obrigatório")
    return {"status": "CONCLUIDO"}
