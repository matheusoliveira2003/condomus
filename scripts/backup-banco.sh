#!/usr/bin/env bash
# Backup manual do banco (o plano gratuito do Neon não faz backup agendado).
#
# Uso, a partir da raiz do repositório:
#   read -rs "DATABASE_URL?Cole a URL direta do Neon: "; export DATABASE_URL   # zsh
#   ./scripts/backup-banco.sh
#
# A URL vem do ambiente para não ficar em arquivo nem no histórico do terminal.
# O dump tem dados pessoais: fica em backups/ (fora do git) e não deve ser compartilhado.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Defina DATABASE_URL (URL direta do Neon, sem -pooler) antes de rodar." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null; then
  echo "pg_dump não encontrado. Instale com: brew install postgresql@16" >&2
  exit 1
fi

destino="backups"
mkdir -p "$destino"
arquivo="$destino/condomus-$(date +%Y%m%d-%H%M%S).dump"

# Formato custom (-Fc): compacto e restaurável com pg_restore. Sem donos nem privilégios,
# para poder restaurar em outro banco ou projeto.
pg_dump --format=custom --no-owner --no-privileges --file="$arquivo" "$DATABASE_URL"

chmod 600 "$arquivo"
echo "Backup salvo em $arquivo ($(du -h "$arquivo" | cut -f1))"
echo "Para restaurar num banco vazio: pg_restore --no-owner --dbname=\"\$DATABASE_URL\" $arquivo"
