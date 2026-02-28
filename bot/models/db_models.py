"""
Database models and enums
"""
from enum import Enum


class League(Enum):
    KOLA = "Қола"
    KUMIS = "Күміс"
    ALTYN = "Алтын"
    PLATINA = "Платина"
    ALMAS = "Алмас"


LEAGUE_ORDER = [League.KOLA, League.KUMIS, League.ALTYN, League.PLATINA, League.ALMAS]

