"""
Bank task repository.

The implementation is split into cohesive mixins under repositories/bank/.
At runtime everything is one class, so internal cross-calls and the public
``db.bank_tasks.*`` surface are unchanged. The version exceptions are
re-exported here because existing imports reference this module.
"""
from .base import BaseRepository
from .bank.audit import BankTaskAuditMixin
from .bank.crud import BankTaskCrudMixin
from .bank.helpers import BankTaskHelpersMixin
from .bank.quality import BankTaskQualityMixin
from .bank.similarity import BankTaskSimilarityMixin
from .bank.versions import (
    BankTaskVersionConflictError,
    BankTaskVersionDeleteError,
    BankTaskVersionsMixin,
)

__all__ = [
    "BankTaskRepository",
    "BankTaskVersionConflictError",
    "BankTaskVersionDeleteError",
]


class BankTaskRepository(
    BankTaskCrudMixin,
    BankTaskVersionsMixin,
    BankTaskAuditMixin,
    BankTaskQualityMixin,
    BankTaskSimilarityMixin,
    BankTaskHelpersMixin,
    BaseRepository,
):
    """Repository for the admin bank-task pool used to build trial tests."""
