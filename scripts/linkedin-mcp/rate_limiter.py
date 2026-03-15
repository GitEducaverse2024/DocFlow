"""
DoCatFlow LinkedIn MCP — Rate Limiter
Limites anti-ban para proteger la cuenta de LinkedIn.
"""
import json
import time
import random
from datetime import datetime
from pathlib import Path

LIMITS = {
    "get_person_profile":  {"per_hour": 10, "per_day": 30},
    "search_people":       {"per_hour": 5,  "per_day": 15},
    "get_company_profile": {"per_hour": 15, "per_day": 40},
    "get_company_posts":   {"per_hour": 15, "per_day": 40},
    "get_job_details":     {"per_hour": 15, "per_day": 40},
    "search_jobs":         {"per_hour": 8,  "per_day": 20},
    "__total__":           {"per_hour": 30, "per_day": 80},
}

STATE_FILE = Path.home() / ".docatflow-linkedin-mcp" / "rate_state.json"


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"calls": {}, "last_hour": "", "last_day": ""}


def _save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def check_and_record(tool_name: str) -> tuple[bool, str]:
    """
    Verifica si la llamada esta dentro de los limites y la registra.
    Retorna (permitido: bool, mensaje: str).
    Incluye delay aleatorio de 5-12s si se permite.
    """
    state = _load_state()
    now = datetime.now()
    hour_key = now.strftime("%Y-%m-%d-%H")
    day_key = now.strftime("%Y-%m-%d")

    # Resetear contadores al cambiar hora/dia
    if state.get("last_hour") != hour_key:
        for k in state.get("calls", {}):
            state["calls"][k]["hour"] = 0
        state["last_hour"] = hour_key

    if state.get("last_day") != day_key:
        for k in state.get("calls", {}):
            state["calls"][k]["day"] = 0
        state["last_day"] = day_key

    # Verificar limites para este tool y el total
    for key in [tool_name, "__total__"]:
        if key not in LIMITS:
            continue
        counts = state["calls"].get(key, {"hour": 0, "day": 0})
        if counts["hour"] >= LIMITS[key]["per_hour"]:
            return False, f"Limite por hora alcanzado para {key} ({LIMITS[key]['per_hour']}/h). Proxima hora disponible."
        if counts["day"] >= LIMITS[key]["per_day"]:
            return False, f"Limite diario alcanzado para {key} ({LIMITS[key]['per_day']}/dia). Manana disponible."

    # Registrar la llamada
    for key in [tool_name, "__total__"]:
        if key not in state["calls"]:
            state["calls"][key] = {"hour": 0, "day": 0}
        state["calls"][key]["hour"] += 1
        state["calls"][key]["day"] += 1

    _save_state(state)

    # Delay anti-deteccion (5-12 segundos aleatorio)
    delay = random.uniform(5.0, 12.0)
    time.sleep(delay)

    return True, "OK"


def get_usage_stats() -> dict:
    """Retorna estadisticas de uso actuales para monitoreo."""
    state = _load_state()
    stats = {}
    for tool, counts in state.get("calls", {}).items():
        limit = LIMITS.get(tool, {"per_hour": 0, "per_day": 0})
        stats[tool] = {
            "hour_used": counts.get("hour", 0),
            "hour_limit": limit["per_hour"],
            "day_used": counts.get("day", 0),
            "day_limit": limit["per_day"],
        }
    return stats


if __name__ == "__main__":
    # Test rapido
    ok, msg = check_and_record("get_person_profile")
    print(f"Resultado: {ok} — {msg}")
    print("Stats:", json.dumps(get_usage_stats(), indent=2))
