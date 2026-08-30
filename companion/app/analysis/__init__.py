"""V4 vacancy analysis — AOPS-08.

Provider protocol, prompt compiler, structured output validation,
deterministic literal QA, and analysis orchestration.
"""

from app.analysis.models import (
    AnalysisRunResult,
    AnalyzeRequest,
    PayloadPreview,
    PromptCompilerInput,
    V4StructuredResult,
)
from app.analysis.provider import LLMProvider, create_provider
from app.analysis.service import AnalysisOptions, AnalysisService

__all__ = [
    'AnalysisOptions',
    'AnalysisRunResult',
    'AnalysisService',
    'AnalyzeRequest',
    'LLMProvider',
    'PayloadPreview',
    'PromptCompilerInput',
    'V4StructuredResult',
    'create_provider',
]
