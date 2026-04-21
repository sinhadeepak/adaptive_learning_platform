# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir uv==0.5.*
COPY pyproject.toml ./
COPY src ./src
RUN uv sync --frozen --no-dev || uv sync --no-dev

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app
RUN useradd --create-home --shell /bin/bash app
COPY --from=builder --chown=app:app /app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://localhost:8000/health').status==200 else sys.exit(1)"
CMD ["uvicorn", "institution.main:app", "--host", "0.0.0.0", "--port", "8000"]
