"""alp-stats — shared statistical primitives.

Every primitive is a small, well-tested class with a deliberately
narrow public surface. Callers import them by name; nothing else
should travel through this module.
"""

from alp_stats.beta_binomial import BetaBinomialPosterior
from alp_stats.hierarchical import HierarchicalBayes, HierarchicalEstimate
from alp_stats.irt import IRTItem, IRTModel
from alp_stats.survival import KaplanMeier, SurvivalCurve
from alp_stats.thompson import Arm, ThompsonSampler

__all__ = [
    "BetaBinomialPosterior",
    "HierarchicalBayes",
    "HierarchicalEstimate",
    "IRTItem",
    "IRTModel",
    "KaplanMeier",
    "SurvivalCurve",
    "Arm",
    "ThompsonSampler",
]

__version__ = "0.1.0"
