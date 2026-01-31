from pydantic import BaseModel


class AddressList(BaseModel):
    address_ids: list[int]
    destination_srid: int | None = None
