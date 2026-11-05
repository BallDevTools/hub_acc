# ใช้ร่วมกันระหว่างสคริปต์ deploy และ restore
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
export ENV_FILE="${ENV_FILE:-$repo_root/.env.production}"
[ -f "$ENV_FILE" ] || { echo "ไม่พบ $ENV_FILE" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }
