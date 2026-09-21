FROM python:3.9-slim

COPY governance/ /app/governance/
COPY cc-governance-bmsd-server/ /app/cc-governance-bmsd-server/

WORKDIR /app/cc-governance-bmsd-server

RUN pip install --no-cache-dir -r requirements.txt

CMD ["waitress-serve", "--listen=0.0.0.0:5000", "app:app"]
