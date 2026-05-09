import { useLocation } from "wouter";
import { ChevronLeft, Shield, FileText, Cookie, RefreshCw } from "lucide-react";

type Tab = "terms" | "privacy" | "cookies" | "refunds";

export function LegalPage({ tab = "terms" }: { tab?: Tab }) {
  const [, navigate] = useLocation();

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "terms",   label: "Términos",   icon: FileText },
    { id: "privacy", label: "Privacidad", icon: Shield },
    { id: "cookies", label: "Cookies",    icon: Cookie },
    { id: "refunds", label: "Reembolsos", icon: RefreshCw },
  ];

  const active = tabs.find(t => t.id === tab)!;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <active.icon className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{active.label}</span>
        </div>
        <div className="ml-auto flex gap-1 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(`/${t.id === "terms" ? "terms" : t.id === "privacy" ? "privacy" : t.id === "cookies" ? "cookies" : "refunds"}`)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 prose prose-sm dark:prose-invert">
        {tab === "terms"   && <TermsContent />}
        {tab === "privacy" && <PrivacyContent />}
        {tab === "cookies" && <CookiesContent />}
        {tab === "refunds" && <RefundsContent />}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-foreground mb-3 pb-2 border-b border-border">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function TermsContent() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Términos y Condiciones</h1>
        <p className="text-xs text-muted-foreground">Última actualización: Abril 2026 · Versión 1.0 · Tartus Digital Solutions</p>
      </div>

      <Section title="1. Descripción del servicio">
        <p>LinkServi es una plataforma digital operada por <strong className="text-foreground">Tartus Digital Solutions</strong> que conecta clientes con profesionales independientes para la prestación de servicios profesionales en Venezuela. LinkServi actúa como intermediario tecnológico y no es empleador de ningún profesional registrado en la plataforma.</p>
      </Section>

      <Section title="2. Registro y elegibilidad">
        <p>Para usar LinkServi debes ser mayor de 18 años y proporcionar información veraz y actualizada. Eres responsable de mantener la seguridad de tu cuenta y de todas las actividades que ocurran en ella.</p>
        <p>Los profesionales deben completar el proceso de verificación de identidad antes de ofrecer servicios. LinkServi se reserva el derecho de suspender o eliminar cuentas que violen estos términos.</p>
      </Section>

      <Section title="3. Modelo de pagos y comisiones">
        <p>LinkServi cobra una comisión del <strong className="text-foreground">10%</strong> sobre el valor de cada servicio completado exitosamente. Esta comisión se descuenta automáticamente de los fondos a liberar al profesional.</p>
        <p>Los pagos son gestionados por LinkServi como agente de cobro. Los fondos del cliente se retienen hasta que el servicio sea confirmado como completado. LinkServi verifica manualmente los comprobantes de pago en un plazo máximo de 30 minutos durante horario hábil.</p>
      </Section>

      <Section title="4. Obligaciones del cliente">
        <p>El cliente se compromete a: (i) proporcionar información precisa sobre el servicio solicitado; (ii) realizar el pago dentro del plazo establecido (30 minutos tras la aceptación); (iii) confirmar la finalización del trabajo de buena fe; y (iv) utilizar el sistema de disputas únicamente cuando exista una razón legítima.</p>
      </Section>

      <Section title="5. Obligaciones del profesional">
        <p>El profesional se compromete a: (i) completar los servicios con profesionalismo y en el tiempo acordado; (ii) no iniciar el trabajo sin la confirmación de pago de LinkServi; (iii) mantener su perfil e información actualizada; y (iv) no solicitar pagos fuera de la plataforma.</p>
      </Section>

      <Section title="6. Garantía LinkServi — 15 días">
        <p>Todo servicio completado cuenta con una garantía de <strong className="text-foreground">15 días calendario</strong> desde la fecha de finalización. Si el trabajo presentó fallas, el cliente puede activar la garantía desde su historial de reservas. El profesional original está obligado a atender el reclamo sin costo adicional para el cliente. El incumplimiento de esta obligación resultará en la suspensión inmediata de la cuenta.</p>
      </Section>

      <Section title="7. Disputas y resolución de conflictos">
        <p>En caso de disputa, LinkServi revisará la evidencia disponible y emitirá una resolución en un plazo de 24 horas. La decisión de LinkServi sobre la distribución de fondos en disputa es final y vinculante. Los profesionales con disputas activas no podrán solicitar retiros hasta su resolución.</p>
      </Section>

      <Section title="8. Limitación de responsabilidad">
        <p>LinkServi no garantiza la calidad de los servicios prestados por los profesionales independientes. Nuestra responsabilidad máxima se limita al monto de la transacción en disputa. No somos responsables por daños indirectos, pérdidas de ingresos o cualquier daño derivado del uso de la plataforma.</p>
      </Section>

      <Section title="9. Modificaciones">
        <p>LinkServi se reserva el derecho de modificar estos términos en cualquier momento. Los cambios significativos serán notificados con al menos 7 días de anticipación. El uso continuado de la plataforma tras la notificación implica la aceptación de los nuevos términos.</p>
      </Section>

      <Section title="10. Contacto">
        <p>Para consultas sobre estos términos, contáctanos en <strong className="text-foreground">soporte@linkservi.com</strong> o a través de WhatsApp en el número de soporte disponible en la plataforma.</p>
        <p className="text-xs mt-2">Operado por: <strong className="text-foreground">Tartus Digital Solutions</strong></p>
      </Section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Política de Privacidad</h1>
        <p className="text-xs text-muted-foreground">Última actualización: Abril 2026 · Versión 1.0 · Tartus Digital Solutions</p>
      </div>

      <Section title="1. Información que recopilamos">
        <p><strong className="text-foreground">Información de registro:</strong> nombre completo, correo electrónico, número de teléfono, estado y ciudad de residencia.</p>
        <p><strong className="text-foreground">Información de perfil:</strong> foto de perfil, habilidades y descripción profesional (para profesionales).</p>
        <p><strong className="text-foreground">Documentos de identidad:</strong> para profesionales, recopilamos tipo y número de documento, foto del documento y selfie de verificación. Esta información se usa exclusivamente para verificar identidad y no se comparte con terceros.</p>
        <p><strong className="text-foreground">Datos de ubicación:</strong> coordenadas GPS opcionales para mostrar profesionales cercanos. Nunca rastreamos tu ubicación en tiempo real ni la almacenamos de forma continua.</p>
        <p><strong className="text-foreground">Datos de transacciones:</strong> comprobantes de pago, montos, métodos de pago y referencias. Los comprobantes se almacenan temporalmente para verificación y se eliminan tras 90 días.</p>
      </Section>

      <Section title="2. Cómo usamos tu información">
        <p>Usamos tu información para: (i) operar y mejorar la plataforma; (ii) verificar identidades y prevenir fraude; (iii) procesar y verificar pagos; (iv) enviarte notificaciones relevantes a tus transacciones; y (v) cumplir con obligaciones legales aplicables en Venezuela.</p>
      </Section>

      <Section title="3. Compartir información">
        <p>No vendemos ni alquilamos tu información personal. Solo compartimos datos con:</p>
        <p>• <strong className="text-foreground">Entre usuarios:</strong> el nombre y foto del cliente son visibles para el profesional asignado y viceversa, solo durante una transacción activa.</p>
        <p>• <strong className="text-foreground">Proveedores de servicio:</strong> servicios de email (Resend) para notificaciones transaccionales.</p>
        <p>• <strong className="text-foreground">Autoridades:</strong> únicamente cuando sea requerido por ley venezolana aplicable.</p>
      </Section>

      <Section title="4. Seguridad">
        <p>Implementamos medidas de seguridad estándar de la industria: contraseñas hasheadas con bcrypt, tokens JWT con expiración de 7 días, y comunicaciones cifradas mediante HTTPS/TLS. Sin embargo, ningún sistema es 100% seguro. Te recomendamos usar una contraseña fuerte y única.</p>
      </Section>

      <Section title="5. Retención de datos">
        <p>Conservamos tu información mientras tu cuenta esté activa. Puedes solicitar la eliminación de tu cuenta enviando un correo a <strong className="text-foreground">soporte@linkservi.com</strong>. Los datos de transacciones completadas se conservan durante 2 años por razones contables y legales.</p>
      </Section>

      <Section title="6. Tus derechos">
        <p>Tienes derecho a: (i) acceder a tu información personal; (ii) corregir datos incorrectos; (iii) solicitar la eliminación de tu cuenta; y (iv) portabilidad de tus datos de transacciones. Ejerce estos derechos contactándonos en <strong className="text-foreground">soporte@linkservi.com</strong>.</p>
      </Section>

      <Section title="7. Cookies y almacenamiento local">
        <p>Usamos localStorage del navegador para mantener tu sesión activa (token de autenticación) y guardar preferencias de tema. No usamos cookies de rastreo de terceros ni publicidad. Consulta nuestra <button className="text-primary underline bg-transparent border-0 cursor-pointer p-0 text-sm" onClick={() => window.location.href = "/cookies"}>Política de Cookies</button> para más detalles.</p>
      </Section>

      <Section title="8. Contacto">
        <p>Para ejercer tus derechos o consultas sobre privacidad: <strong className="text-foreground">soporte@linkservi.com</strong></p>
        <p className="text-xs mt-2">Operado por: <strong className="text-foreground">Tartus Digital Solutions</strong></p>
      </Section>
    </>
  );
}

function CookiesContent() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Política de Cookies</h1>
        <p className="text-xs text-muted-foreground">Última actualización: Abril 2026 · Versión 1.0 · Tartus Digital Solutions</p>
      </div>

      <Section title="1. ¿Qué son las cookies?">
        <p>Las cookies son pequeños archivos de texto que los sitios web almacenan en tu dispositivo para recordar tus preferencias y mejorar tu experiencia de navegación. LinkServi usa tecnologías similares como <strong className="text-foreground">localStorage</strong> y <strong className="text-foreground">sessionStorage</strong> del navegador.</p>
      </Section>

      <Section title="2. Tecnologías que utilizamos">
        <p><strong className="text-foreground">localStorage (Sesión de usuario):</strong> Almacenamos tu token de autenticación (JWT) para mantenerte conectado entre sesiones. Este dato es estrictamente necesario para el funcionamiento de la plataforma. Se elimina cuando cierras sesión.</p>
        <p><strong className="text-foreground">sessionStorage (Pantalla de bienvenida):</strong> Guardamos una bandera temporal para no mostrar la pantalla de carga cada vez que navegas entre páginas. Se elimina al cerrar el navegador.</p>
        <p><strong className="text-foreground">localStorage (Tema de la interfaz):</strong> Si cambias entre modo oscuro y modo claro, guardamos tu preferencia para que la próxima vez se aplique automáticamente.</p>
      </Section>

      <Section title="3. Lo que NO hacemos">
        <p>LinkServi <strong className="text-foreground">no utiliza</strong>:</p>
        <p>• Cookies de publicidad o remarketing (Google Ads, Meta Pixel, etc.)</p>
        <p>• Cookies de seguimiento entre sitios web de terceros</p>
        <p>• Herramientas de análisis invasivo (como Google Analytics con datos personales)</p>
        <p>• Compartir datos de navegación con redes publicitarias</p>
      </Section>

      <Section title="4. Cookies de terceros">
        <p>La plataforma puede integrar servicios de terceros que establecen sus propias cookies:</p>
        <p>• <strong className="text-foreground">Google (Sign-in):</strong> Si usas "Iniciar sesión con Google", Google puede establecer cookies de autenticación propias sujetas a su política de privacidad.</p>
        <p>• <strong className="text-foreground">Resend (Email transaccional):</strong> Nuestro proveedor de email no establece cookies en tu navegador.</p>
      </Section>

      <Section title="5. Cómo controlar las cookies">
        <p>Puedes controlar y eliminar las cookies desde la configuración de tu navegador:</p>
        <p>• <strong className="text-foreground">Chrome:</strong> Configuración → Privacidad y seguridad → Cookies y otros datos de sitios</p>
        <p>• <strong className="text-foreground">Firefox:</strong> Preferencias → Privacidad y seguridad → Cookies y datos del sitio</p>
        <p>• <strong className="text-foreground">Safari:</strong> Preferencias → Privacidad → Gestionar datos del sitio web</p>
        <p className="text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-yellow-600 dark:text-yellow-400">⚠️ Eliminar el localStorage de LinkServi cerrará tu sesión automáticamente.</p>
      </Section>

      <Section title="6. Actualizaciones de esta política">
        <p>Podemos actualizar esta política si incorporamos nuevas tecnologías o servicios. Te notificaremos de cambios significativos a través de la app. La fecha de la última actualización siempre aparece en la parte superior de este documento.</p>
      </Section>

      <Section title="7. Contacto">
        <p>Para consultas sobre el uso de cookies: <strong className="text-foreground">soporte@linkservi.com</strong></p>
        <p className="text-xs mt-2">Operado por: <strong className="text-foreground">Tartus Digital Solutions</strong></p>
      </Section>
    </>
  );
}

function RefundsContent() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Política de Reembolsos</h1>
        <p className="text-xs text-muted-foreground">Última actualización: Abril 2026 · Versión 1.0 · Tartus Digital Solutions</p>
      </div>

      <Section title="1. Principio general — Sistema Escrow">
        <p>LinkServi opera bajo un sistema de <strong className="text-foreground">pago en garantía (escrow)</strong>: los fondos del cliente se retienen en la plataforma y solo se liberan al profesional cuando el servicio es confirmado como completado satisfactoriamente. Esto protege a ambas partes.</p>
      </Section>

      <Section title="2. Casos en que aplica un reembolso">
        <p>Tienes derecho a reembolso total o parcial en los siguientes casos:</p>
        <p>• <strong className="text-foreground">Profesional no se presentó:</strong> Si el profesional acepta la solicitud pero no se presenta ni responde en un plazo razonable, se te reembolsa el 100% del pago.</p>
        <p>• <strong className="text-foreground">Servicio cancelado por el profesional:</strong> Si el profesional cancela después de que confirmas el pago, recibes el reembolso completo.</p>
        <p>• <strong className="text-foreground">Disputa resuelta a favor del cliente:</strong> Si abres una disputa y LinkServi determina que el servicio no fue prestado adecuadamente, se te reembolsa el monto en disputa.</p>
        <p>• <strong className="text-foreground">Error de pago:</strong> Si realizaste un pago por error antes de que el profesional lo acepte, contáctanos dentro de los 30 minutos siguientes.</p>
      </Section>

      <Section title="3. Casos en que NO aplica reembolso">
        <p>• El servicio fue completado y confirmado por el cliente como satisfactorio.</p>
        <p>• El cliente cancela la solicitud después de que el profesional ya inició el servicio.</p>
        <p>• La disputa es resuelta a favor del profesional por LinkServi.</p>
        <p>• El cliente proporcionó información incorrecta que impidió la prestación del servicio.</p>
        <p>• Han pasado más de 15 días desde la finalización del servicio sin que se haya abierto una disputa.</p>
      </Section>

      <Section title="4. Garantía LinkServi — 15 días">
        <p>Todo servicio completado cuenta con <strong className="text-foreground">Garantía LinkServi de 15 días</strong>. Esta garantía no implica reembolso monetario, sino la obligación del profesional original de corregir las fallas sin costo adicional. Si el profesional no cumple, LinkServi evaluará el caso para determinar una compensación apropiada.</p>
      </Section>

      <Section title="5. Proceso de solicitud de reembolso">
        <p><strong className="text-foreground">Paso 1:</strong> Abre una disputa desde tu historial de reservas dentro del período de 15 días.</p>
        <p><strong className="text-foreground">Paso 2:</strong> Describe el problema con la mayor cantidad de evidencia posible (fotos, mensajes, etc.).</p>
        <p><strong className="text-foreground">Paso 3:</strong> LinkServi revisará el caso en un plazo de <strong className="text-foreground">24 horas hábiles</strong>.</p>
        <p><strong className="text-foreground">Paso 4:</strong> Si el reembolso es aprobado, el monto se acredita a tu wallet interno en la plataforma. Desde allí puedes usarlo para futuros servicios o solicitar su devolución.</p>
      </Section>

      <Section title="6. Reembolsos en ServiMarket (Productos y Alquileres)">
        <p><strong className="text-foreground">Productos:</strong> Dispones de <strong className="text-foreground">7 días</strong> desde la recepción del producto para solicitar devolución si llega dañado o no corresponde a la descripción. El vendedor debe aceptar la devolución del producto antes de que se procese el reembolso.</p>
        <p><strong className="text-foreground">Alquileres:</strong> El depósito de garantía se libera automáticamente al finalizar el alquiler si no hay daños reportados. Si el propietario reporta daños, LinkServi actúa como árbitro y puede retener o liberar el depósito parcial o totalmente según la evidencia.</p>
      </Section>

      <Section title="7. Tiempo de procesamiento">
        <p>Los reembolsos aprobados se acreditan al wallet interno de LinkServi de forma inmediata. Si solicitas la devolución a tu método de pago original (transferencia bancaria, Pago Móvil), el proceso puede tomar entre <strong className="text-foreground">3 a 5 días hábiles</strong> dependiendo de tu institución financiera.</p>
      </Section>

      <Section title="8. Contacto para reembolsos">
        <p>Si tienes dudas o necesitas asistencia con tu caso: <strong className="text-foreground">soporte@linkservi.com</strong></p>
        <p>También puedes contactarnos por WhatsApp a través del botón de soporte disponible en la app para casos urgentes.</p>
        <p className="text-xs mt-2">Operado por: <strong className="text-foreground">Tartus Digital Solutions</strong></p>
      </Section>
    </>
  );
}
