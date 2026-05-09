import { useState, useEffect } from "react";
import { Fingerprint, Trash2, Plus, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import {
  isBiometricAvailable,
  hasBiometricRegistered,
  registerBiometric,
  listPasskeys,
  deletePasskey,
} from "@/hooks/useBiometric";

export function BiometricSettings() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<{ id: number; deviceType: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setSupported(isBiometricAvailable());
    loadPasskeys();
  }, []);

  async function loadPasskeys() {
    setLoading(true);
    setPasskeys(await listPasskeys());
    setLoading(false);
  }

  function showMsg(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleRegister() {
    setRegistering(true);
    const result = await registerBiometric();
    setRegistering(false);
    if (result.ok) {
      showMsg("¡Biometría activada! Ya puedes ingresar con tu huella o Face ID.", true);
      await loadPasskeys();
    } else {
      showMsg(result.error ?? "Error al registrar.", false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    await deletePasskey(id);
    setDeletingId(null);
    showMsg("Llave biométrica eliminada.", true);
    await loadPasskeys();
  }

  if (!supported) {
    return (
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex items-start gap-3">
          <Fingerprint className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Acceso biométrico</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tu navegador o dispositivo no soporta autenticación biométrica (WebAuthn).
              Intenta desde Chrome, Safari o Edge en un dispositivo con huella o Face ID.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasRegistered = passkeys.length > 0;

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${hasRegistered ? "bg-cyan-500/10" : "bg-muted"}`}>
          <Fingerprint className={`w-5 h-5 ${hasRegistered ? "text-cyan-500" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Acceso biométrico</p>
          <p className="text-xs text-muted-foreground">Huella dactilar · Face ID · Windows Hello</p>
        </div>
        {hasRegistered && (
          <span className="text-xs font-semibold text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 px-2 py-0.5 rounded-full">
            Activo
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Status message */}
        {msg && (
          <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm ${msg.ok ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"}`}>
            {msg.ok ? <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            {msg.text}
          </div>
        )}

        {/* Explanation */}
        {!hasRegistered && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Activa el acceso rápido con tu huella o Face ID. Una vez configurado,
            podrás entrar a LinkServi sin escribir tu contraseña.
          </p>
        )}

        {/* Registered passkeys list */}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
          </div>
        ) : passkeys.length > 0 && (
          <div className="space-y-2">
            {passkeys.map(pk => (
              <div key={pk.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-cyan-500" />
                  <div>
                    <p className="text-xs font-medium text-foreground capitalize">
                      {pk.deviceType === "multiDevice" ? "Llave de plataforma" : "Este dispositivo"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Registrada {new Date(pk.createdAt).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(pk.id)}
                  disabled={deletingId === pk.id}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  {deletingId === pk.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Register button */}
        <button
          onClick={handleRegister}
          disabled={registering}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            hasRegistered
              ? "border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              : "bg-cyan-600 text-white hover:bg-cyan-700"
          } disabled:opacity-50`}
        >
          {registering
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Activando...</>
            : <><Plus className="w-4 h-4" /> {hasRegistered ? "Agregar otro dispositivo" : "Activar biometría"}</>
          }
        </button>
      </div>
    </div>
  );
}
