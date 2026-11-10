FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY start.py ./
COPY public ./public

USER app
EXPOSE 8008

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8008/ >/dev/null || exit 1

ENTRYPOINT ["python3", "start.py", "--host", "0.0.0.0", "--port", "8008", "--no-browser"]
