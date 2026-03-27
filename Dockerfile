FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

ENV PORT=8080 \
    NEWS_DATA_DIR=/data

EXPOSE 8080

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:application"]

