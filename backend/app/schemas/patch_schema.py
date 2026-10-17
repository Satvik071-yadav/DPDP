from pydantic import BaseModel


class UpdateFindingStatusRequest(BaseModel):
    status: str
