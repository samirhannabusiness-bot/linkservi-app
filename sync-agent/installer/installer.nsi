; ─────────────────────────────────────────────────────────────────────────────
; LinkServi Sync Agent — instalador Windows (NSIS Modern UI 2)
;
; Genera: LinkServi-Sync-Agent-Setup-X.Y.Z.exe
;
; Variables que recibe vía /D del script de build (build-installer.mjs):
;   APP_VERSION       — ej. "1.0.0"
;   APP_EXE           — path absoluto a dist/linkservi-sync-agent.exe
;   EXAMPLE_CONFIG    — path absoluto a config.example.json
;   LICENSE_FILE      — path absoluto al license txt
;   OUT_FILE          — path absoluto al .exe del instalador a crear
;
; Funcionalidades:
;   • UI moderna (Welcome → License → Directory → Components → Install → Finish)
;   • Componente "Iniciar con Windows" (registry HKCU\…\Run)
;   • Shortcut en Start Menu y opcional en Desktop
;   • Auto-launch del agente al finalizar (con auto-open browser para 1er uso)
;   • Uninstaller completo (borra archivos, shortcuts y entrada de autostart)
; ─────────────────────────────────────────────────────────────────────────────

!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif
!ifndef APP_EXE
  !define APP_EXE "..\dist\linkservi-sync-agent.exe"
!endif
!ifndef EXAMPLE_CONFIG
  !define EXAMPLE_CONFIG "..\config.example.json"
!endif
!ifndef LICENSE_FILE
  !define LICENSE_FILE "LICENSE.txt"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "..\dist\LinkServi-Sync-Agent-Setup.exe"
!endif

!define APP_NAME       "LinkServi Sync Agent"
!define APP_PUBLISHER  "LinkServi"
!define APP_URL        "https://linkservi.com"
!define APP_BIN        "linkservi-sync-agent.exe"
!define UNINST_KEY     "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define AUTOSTART_KEY  "Software\Microsoft\Windows\CurrentVersion\Run"
!define AUTOSTART_NAME "LinkServiSyncAgent"

; Unicode debe declararse ANTES de OutFile (cambia el charset target).
Unicode true
SetCompressor /SOLID lzma

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\LinkServiSyncAgent"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUnInstDetails show
BrandingText "${APP_NAME} v${APP_VERSION}"

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName"     "${APP_NAME}"
VIAddVersionKey "CompanyName"     "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "Sincroniza tu inventario SAINT con LinkServi automáticamente"
VIAddVersionKey "FileVersion"     "${APP_VERSION}"
VIAddVersionKey "ProductVersion"  "${APP_VERSION}"
VIAddVersionKey "LegalCopyright"  "© LinkServi"

; ─── Modern UI ───────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON   "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

; Welcome page custom text
!define MUI_WELCOMEPAGE_TITLE   "Bienvenido al instalador de ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT    "Este asistente instalará ${APP_NAME} en tu computadora.$\r$\n$\r$\nEl Sync Agent se conecta a tu base de datos SAINT y mantiene tu catálogo sincronizado en LinkServi automáticamente, sin intervención manual.$\r$\n$\r$\nPresiona Siguiente para continuar."

; Finish page custom: launch + open config UI
!define MUI_FINISHPAGE_TITLE    "Instalación completada"
!define MUI_FINISHPAGE_TEXT     "${APP_NAME} se instaló correctamente.$\r$\n$\r$\nAl iniciarlo por primera vez se abrirá el navegador para que configures tu API Key y los datos de SAINT."
!define MUI_FINISHPAGE_RUN      "$INSTDIR\${APP_BIN}"
!define MUI_FINISHPAGE_RUN_TEXT "Iniciar ${APP_NAME} ahora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_LANGUAGE "English"

; ─── Sections ────────────────────────────────────────────────────────────────

Section "!${APP_NAME} (requerido)" SecCore
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "${APP_EXE}"
  ; Plantilla de configuración (no sobreescribimos config.json existente)
  SetOverwrite off
  File /oname=config.example.json "${EXAMPLE_CONFIG}"
  SetOverwrite on

  ; Carpeta de logs (con permisos para el usuario)
  CreateDirectory "$LOCALAPPDATA\LinkServiSyncAgent\logs"

  ; Shortcut en Start Menu
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_BIN}" "" "$INSTDIR\${APP_BIN}" 0
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Abrir panel.lnk" "http://127.0.0.1:7777" "" "" 0
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Carpeta de logs.lnk" "$LOCALAPPDATA\LinkServiSyncAgent\logs"
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"

  ; Registro de uninstall (para "Programas y características")
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout"    "${APP_URL}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\${APP_BIN}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Iniciar con Windows" SecAutostart
  ; Agrega entrada en HKCU\…\Run para que arranque al iniciar sesión.
  ; Argumentos: --service (no abre consola) y --no-open (no abre browser cada login).
  WriteRegStr HKCU "${AUTOSTART_KEY}" "${AUTOSTART_NAME}" '"$INSTDIR\${APP_BIN}" --service --no-open'
SectionEnd

Section "Acceso directo en Escritorio" SecDesktop
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_BIN}" "" "$INSTDIR\${APP_BIN}" 0
SectionEnd

; ─── Descripción de componentes (tooltips) ───────────────────────────────────
LangString DESC_SecCore      ${LANG_SPANISH} "Archivos del programa (requerido)."
LangString DESC_SecAutostart ${LANG_SPANISH} "Inicia el agente automáticamente al encender Windows. Recomendado."
LangString DESC_SecDesktop   ${LANG_SPANISH} "Crea un acceso directo en el escritorio."
LangString DESC_SecCore      ${LANG_ENGLISH} "Program files (required)."
LangString DESC_SecAutostart ${LANG_ENGLISH} "Start agent automatically with Windows. Recommended."
LangString DESC_SecDesktop   ${LANG_ENGLISH} "Create a desktop shortcut."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore}      $(DESC_SecCore)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAutostart} $(DESC_SecAutostart)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop}   $(DESC_SecDesktop)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ─── Uninstaller ─────────────────────────────────────────────────────────────
Section "Uninstall"
  ; Detiene el proceso si está corriendo
  ExecWait 'taskkill /F /IM ${APP_BIN}'

  Delete "$INSTDIR\${APP_BIN}"
  Delete "$INSTDIR\config.example.json"
  Delete "$INSTDIR\Uninstall.exe"
  ; NO borramos config.json ni la carpeta de logs (datos del usuario).

  RMDir  "$INSTDIR"

  ; Shortcuts
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Abrir panel.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Carpeta de logs.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Desinstalar.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  ; Registro
  DeleteRegValue HKCU "${AUTOSTART_KEY}" "${AUTOSTART_NAME}"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
