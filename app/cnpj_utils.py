import re


def only_digits(value: str | None) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_cnpj(value: str | None) -> str:
    digits = only_digits(value)
    if len(digits) != 14:
        raise ValueError("CNPJ inválido. Informe 14 números.")
    return digits


def format_cnpj(digits: str | None) -> str:
    d = only_digits(digits)
    if len(d) != 14:
        return str(digits or "")
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
