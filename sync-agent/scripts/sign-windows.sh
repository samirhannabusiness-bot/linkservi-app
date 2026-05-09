#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# LinkServi Sync Agent — code signing helper (Windows .exe + installer).
#
# Reduce las advertencias de SmartScreen y antivirus en clientes finales.
# Sin firma, Windows muestra "publisher unknown" — funciona pero aumenta soporte.
#
# USO:
#   SIGN_CERT_PATH=/ruta/cert.pfx \
#   SIGN_CERT_PASSWORD='secret' \
#   ./scripts/sign-windows.sh dist/linkservi-sync-agent.exe
#
# Si SIGN_CERT_PATH no está definido, sale con warning (NO falla el build).
#
# Herramienta usada (en orden de preferencia):
#   1. signtool.exe        — Windows SDK (en PATH si corres en Windows)
#   2. osslsigncode        — Linux/macOS (Nix: `osslsigncode`, brew: idem)
# ─────────────────────────────────────────────────────────────────────────────
set -eu
set -o pipefail

TARGET="${1:-}"
TIMESTAMP_URL="${SIGN_TIMESTAMP_URL:-http://timestamp.digicert.com}"
DESCRIPTION="${SIGN_DESCRIPTION:-LinkServi Sync Agent}"
URL="${SIGN_URL:-https://linkservi.com}"

if [[ -z "${TARGET}" ]]; then
  echo "✘ uso: $0 <archivo.exe>"
  exit 2
fi
if [[ ! -f "${TARGET}" ]]; then
  echo "✘ archivo no encontrado: ${TARGET}"
  exit 2
fi

# Si no hay certificado configurado, salimos con warning (NO error).
# El build debe seguir funcionando para devs sin acceso al certificado.
if [[ -z "${SIGN_CERT_PATH:-}" ]]; then
  echo "⚠ Code signing no configurado — el ejecutable puede mostrar"
  echo "  advertencias en Windows (SmartScreen / antivirus)."
  echo "  Para firmar: define SIGN_CERT_PATH y SIGN_CERT_PASSWORD."
  exit 0
fi
if [[ ! -f "${SIGN_CERT_PATH}" ]]; then
  echo "✘ Certificado no encontrado: ${SIGN_CERT_PATH}"
  exit 1
fi

# Detectar herramienta disponible. Desactivamos `set -e` localmente para
# capturar el exitcode del firmador y emitir un mensaje claro si falla.
exitcode=0
if command -v signtool >/dev/null 2>&1; then
  echo "▶ Firmando con signtool: ${TARGET}"
  set +e
  signtool sign \
    /f "${SIGN_CERT_PATH}" \
    /p "${SIGN_CERT_PASSWORD:-}" \
    /tr "${TIMESTAMP_URL}" \
    /td sha256 /fd sha256 \
    /d "${DESCRIPTION}" /du "${URL}" \
    "${TARGET}"
  exitcode=$?
  set -e
elif command -v osslsigncode >/dev/null 2>&1; then
  echo "▶ Firmando con osslsigncode: ${TARGET}"
  TMP="${TARGET}.signed"
  set +e
  osslsigncode sign \
    -pkcs12 "${SIGN_CERT_PATH}" \
    -pass "${SIGN_CERT_PASSWORD:-}" \
    -ts "${TIMESTAMP_URL}" \
    -h sha256 \
    -n "${DESCRIPTION}" -i "${URL}" \
    -in "${TARGET}" -out "${TMP}"
  exitcode=$?
  set -e
  if [[ $exitcode -eq 0 ]]; then
    mv "${TMP}" "${TARGET}"
  else
    rm -f "${TMP}"
  fi
else
  echo "⚠ Ni signtool ni osslsigncode disponibles."
  echo "  Linux/Replit: nix-env -iA nixpkgs.osslsigncode"
  echo "  macOS:        brew install osslsigncode"
  echo "  Windows:      Windows SDK (signtool.exe en PATH)"
  echo "  Continuando SIN firmar — el .exe funciona pero mostrará warnings."
  exit 0
fi

if [[ $exitcode -eq 0 ]]; then
  echo "✔ Firmado: ${TARGET}"
  exit 0
else
  echo "✘ La firma falló (código $exitcode)"
  exit $exitcode
fi
