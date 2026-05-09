import { db, blogArticlesTable } from "@workspace/db";

const NOW = new Date("2026-04-24T12:00:00Z");
function hoursAgo(h: number) { return new Date(NOW.getTime() - h * 3_600_000); }

const articles = [
  // ── 1. Precio electricista ─────────────────────────────────────────────────
  {
    slug: "cuanto-cuesta-electricista-venezuela-2026",
    title: "¿Cuánto cuesta un electricista en Venezuela en 2026? Precios reales",
    excerpt: "Descubre los precios reales de los electricistas en Venezuela en 2026, qué incluye el costo y cómo evitar que te cobren de más.",
    contentMd: `## ¿Cuánto cuesta un electricista en Venezuela en 2026?

Antes de llamar a cualquier electricista, necesitas saber qué esperar. Contratar sin información es la manera más rápida de pagar el doble por un trabajo que valía la mitad.

Esta guía te da los precios reales, qué factores los afectan y cómo encontrar a alguien confiable sin arriesgar tu dinero ni tu seguridad.

:::cta href=/workers text=Ver electricistas verificados disponibles ahora variant=primary subtitle=Precios transparentes antes de contratar:::

## ¿Qué determina el costo de un electricista?

No existe un precio único. El costo varía según:

- **Tipo de trabajo**: no es lo mismo cambiar un tomacorriente que instalar un tablero eléctrico completo
- **Ciudad**: Caracas y Maracaibo suelen tener tarifas más altas que ciudades del interior
- **Urgencia**: los servicios de emergencia (24 h) tienen un recargo
- **Materiales incluidos o no**: algunos electricistas cobran solo la mano de obra

## Tabla de precios reales 2026

| Servicio | Precio estimado (USD) | Tiempo promedio |
|---|---|---|
| Cambio de tomacorriente o interruptor | $8 – $18 | 30 min |
| Instalación de punto de luz nuevo | $15 – $35 | 1 – 2 h |
| Revisión de tablero eléctrico | $20 – $45 | 1 h |
| Instalación de breakers / protectores | $25 – $60 | 1 – 2 h |
| Cableado habitación completa | $60 – $150 | 4 – 8 h |
| Instalación de planta eléctrica | $80 – $200 | 4 – 6 h |
| Revisión completa casa (informe) | $40 – $90 | 2 – 3 h |

> Nota: los precios son orientativos y dependen de la zona y el profesional. Siempre pide presupuesto antes de aprobar el trabajo.

## ¿Cuándo el precio es señal de alerta?

### Demasiado barato

Un electricista que cobra la mitad del mercado generalmente corta costos en algún lugar: materiales de baja calidad, instalaciones sin normas, o simplemente no termina el trabajo. Una instalación eléctrica mal hecha puede causar un cortocircuito, un incendio o la pérdida de tus equipos.

### Demasiado caro sin justificación

Si un electricista te pide mucho más del rango del mercado y no puede explicar por qué, o te presiona para que aceptes antes de ver el trabajo, eso también es una señal de alerta.

:::cta href=/workers text=Encuentra electricistas con precios visibles antes de contratar variant=primary subtitle=Sin sorpresas al final:::

## ¿Qué debe incluir un presupuesto serio?

Antes de que cualquier electricista empiece a trabajar, debes tener claro:

1. Descripción exacta del trabajo a realizar
2. Lista de materiales que usará (y si están incluidos en el precio)
3. Tiempo estimado de trabajo
4. Garantía sobre la instalación (mínimo 30 días en mano de obra)
5. Forma de pago acordada

Un profesional serio no tiene problema en darte esto por escrito o por mensaje.

## Por qué vale la pena pagar por un profesional verificado

El problema con contratar a alguien que conseguiste por referencia o en la calle es que no tienes forma de verificar su historial. Si algo sale mal después, estás solo.

Un electricista verificado tiene:

- Historial de trabajos anteriores
- Calificaciones de clientes reales
- Responsabilidad sobre su trabajo
- Incentivo para hacerlo bien (su reputación depende de ello)

:::workers title=Electricistas disponibles en tu zona ahora:::

## ¿Cómo contratar un electricista confiable en Venezuela?

El proceso correcto es simple:

1. Describe el problema con la mayor precisión posible
2. Solicita presupuesto antes de aprobar cualquier trabajo
3. Verifica que tenga calificaciones reales de otros clientes
4. Paga una vez que el trabajo esté terminado y hayas verificado que funciona
5. Califica al profesional para ayudar a otros usuarios

En LinkServi puedes ver el perfil de cada electricista, sus trabajos anteriores, su calificación promedio y su precio base antes de contactarlo.

:::cta href=/workers text=Contratar un electricista verificado en LinkServi variant=primary:::`,
    category: "electricidad",
    metaTitle: "¿Cuánto cuesta un electricista en Venezuela en 2026? Precios reales",
    metaDescription: "Precios reales de electricistas en Venezuela en 2026. Tabla de costos por servicio, señales de alerta y cómo contratar con seguridad en LinkServi.",
    isPublished: true,
    publishedAt: hoursAgo(2),
  },

  // ── 2. AC no enfría ────────────────────────────────────────────────────────
  {
    slug: "aire-acondicionado-no-enfria-causas-soluciones-venezuela",
    title: "Mi aire acondicionado no enfría: causas, soluciones y cuándo llamar al técnico",
    excerpt: "Si tu aire acondicionado está encendido pero no enfría, no lo desconectes todavía. Aquí están las causas más comunes y qué puedes hacer antes de gastar en repuestos.",
    contentMd: `## Mi aire acondicionado está encendido pero no enfría. ¿Qué está pasando?

Es uno de los problemas más frustrantes del hogar venezolano, especialmente en ciudades como Maracaibo, Barcelona o Maturín donde el calor es constante. El equipo funciona, hace ruido, el ventilador gira, pero el aire que sale no está frío.

Antes de entrar en pánico o comprar un equipo nuevo, lee esto. La mayoría de las veces la solución es más simple de lo que parece — y más barata.

:::cta href=/workers text=¿Prefieres que un técnico lo revise hoy? Ver disponibles variant=primary subtitle=Diagnóstico sin compromiso:::

## Las 5 causas más comunes

### 1. Filtro sucio

El filtro del aire acondicionado atrapa polvo, pelo y partículas. Cuando está muy sucio, bloquea el flujo de aire y el equipo no puede enfriar correctamente.

**Solución**: retira el filtro, lávalo con agua tibia y jabón, déjalo secar completamente y vuelve a instalarlo. Haz esto cada 30 días.

### 2. El evaporador está congelado

Si el tubo de cobre que sale de la unidad interior tiene hielo, el evaporador está congelado. Esto ocurre generalmente por falta de gas refrigerante o por el filtro sucio.

**Qué hacer**: apaga el equipo en modo ventilación por 2-4 horas hasta que el hielo se derrita. Luego llama a un técnico para revisar el nivel de gas.

### 3. Gas refrigerante bajo o agotado

El gas (refrigerante) es lo que genera el frío. Si hay una fuga o el gas se agotó, el equipo no puede enfriar. Este es un problema que **no puedes resolver tú solo** — requiere un técnico con equipo especializado.

### 4. El compresor tiene falla

El compresor es el corazón del sistema. Si falla, el equipo enciende pero no hay refrigeración. Se detecta porque el ventilador exterior no gira o el circuito se cae constantemente.

### 5. Voltaje inestable

La corriente eléctrica inestable es un problema real en Venezuela. Los equipos de A/C son sensibles y pueden dañarse si el voltaje sube y baja con frecuencia. Un protector de voltaje es inversión necesaria.

:::cta href=/workers text=Técnicos de aire acondicionado cerca de ti variant=primary subtitle=Disponibles hoy:::

## ¿Qué puedes revisar tú mismo antes de llamar?

| Síntoma | Posible causa | ¿Puedes resolverlo tú? |
|---|---|---|
| El ventilador funciona pero no hay frío | Gas bajo o filtro sucio | Filtro sí, gas no |
| El equipo congela (hielo visible) | Gas bajo o filtro bloqueado | Apagar y llamar técnico |
| El equipo no enciende | Problema eléctrico o control | Revisar breaker |
| El equipo enciende y se apaga solo | Voltaje inestable | Revisar voltaje |
| El compresor exterior no gira | Falla de compresor o capacitor | Llamar técnico |

## ¿Cuándo llamar a un técnico?

Llama inmediatamente si:

- El equipo tiene hielo y no mejora después de apagarlo
- Escuchas ruidos extraños (golpes, chirridos)
- El circuito se cae cada vez que enciendes el A/C
- Han pasado más de 2 años sin mantenimiento preventivo

**No esperes** si sospechas una fuga de gas: el refrigerante puede ser peligroso y el daño al compresor se vuelve más costoso con el tiempo.

:::workers title=Técnicos de aire acondicionado disponibles ahora:::

## ¿Cuánto cuesta reparar un aire acondicionado en Venezuela?

El diagnóstico suele costar entre $10 y $25 dependiendo del técnico y la ciudad. La recarga de gas generalmente cuesta entre $30 y $80. Una reparación de compresor puede superar los $150.

Siempre pide el diagnóstico primero antes de autorizar cualquier reparación.

:::cta href=/workers text=Ver técnicos con precios y calificaciones reales variant=primary:::`,
    category: "aire-acondicionado",
    metaTitle: "Aire acondicionado no enfría en Venezuela: causas y soluciones 2026",
    metaDescription: "Descubre por qué tu aire acondicionado no enfría y qué puedes hacer antes de llamar al técnico. Guía práctica para Venezuela en 2026.",
    isPublished: true,
    publishedAt: hoursAgo(4),
  },

  // ── 3. Errores al contratar técnico ───────────────────────────────────────
  {
    slug: "errores-contratar-tecnico-venezuela-perder-dinero",
    title: "7 errores al contratar un técnico en Venezuela (y cómo no perder dinero)",
    excerpt: "Contratar al técnico equivocado puede salirte muy caro. Estos son los errores más comunes que cometen los venezolanos al buscar un profesional — y cómo evitarlos.",
    contentMd: `## Contratar mal cuesta más que contratar bien

Lo has visto antes: un amigo paga tres veces más por el mismo trabajo porque no sabía cómo evaluar a quien contrató. O peor: el técnico cobra por adelantado y nunca regresa.

En Venezuela, donde los recursos son limitados y cada reparación representa un esfuerzo real, estos errores pueden doler mucho. Aquí están los 7 más comunes — y exactamente qué hacer para evitarlos.

:::cta href=/workers text=Contratar un profesional verificado sin riesgo variant=primary subtitle=Con historial real y calificaciones:::

## Error 1: Pagar el 100% por adelantado

Es el error clásico. El técnico llega, habla bien, pide el pago completo "para comprar los materiales" y no vuelve.

**La regla**: nunca pagues más del 30-50% por adelantado, y solo si el profesional necesita comprar materiales específicos. El resto se paga cuando el trabajo esté terminado y funcionando.

## Error 2: No pedir presupuesto por escrito (o por mensaje)

"Me dijo que costaba X pero al final me cobró el doble." Esto pasa cuando todo queda verbal.

**La solución**: antes de aprobar cualquier trabajo, pide que te confirmen por escrito (WhatsApp es válido) el precio total, qué incluye y el tiempo estimado. Un profesional serio no tiene problema con esto.

## Error 3: Contratar solo por precio bajo

El precio más bajo no es siempre el mejor negocio. Un técnico que cobra la mitad del mercado a menudo usa materiales de mala calidad, hace el trabajo a medias o simplemente no tiene la experiencia necesaria.

**La regla**: compara 2-3 presupuestos. Si uno es significativamente más barato sin una razón clara, desconfía.

## Error 4: No verificar si tiene experiencia real

"Cualquiera puede decir que sabe arreglar lo que sea." Si no tienes forma de verificar su historial, estás apostando.

**Lo que debes pedir**:
- Referencias de trabajos anteriores
- Fotos de trabajos similares que haya hecho
- En lo posible, una plataforma con calificaciones reales de otros clientes

:::cta href=/workers text=Ver profesionales con historial verificado en LinkServi variant=primary:::

## Error 5: No estar presente durante el trabajo

Algunos técnicos hacen el trabajo más rápido cuando el cliente no está. Más rápido no siempre significa bien hecho.

**Lo que conviene hacer**: estar presente al inicio y al final del trabajo, al menos. Verifica que el resultado funcione correctamente antes de pagar el saldo.

## Error 6: No pedir garantía

Un trabajo serio tiene garantía. Si el electricista instaló un tomacorriente y al día siguiente falla, debería regresar sin costo adicional.

**La regla**: siempre pregunta cuánto tiempo garantiza su trabajo. Mínimo 30 días en mano de obra es lo razonable. Si se niega a dar garantía, es señal de alerta.

## Error 7: Contratar a alguien que no conoce en absoluto, sin referencias

El "lo conseguí en la esquina" o el "me lo recomendó alguien que lo conoce de vista" son categorías de alto riesgo.

**Lo que conviene hacer**: usa plataformas donde los profesionales tienen perfil verificado, historial de trabajos y calificaciones reales de otros clientes. Si algo sale mal, tienes respaldo.

:::workers title=Profesionales con perfil verificado disponibles ahora:::

## Resumen: la checklist antes de contratar

1. ¿Tiene calificaciones reales de clientes anteriores?
2. ¿Tiene historial verificable de trabajos similares?
3. ¿Me dio presupuesto claro antes de empezar?
4. ¿Acordamos el pago en partes (no 100% adelantado)?
5. ¿Ofrece garantía sobre su trabajo?

Si la respuesta a todas es sí, puedes contratar con confianza.

:::cta href=/workers text=Empezar bien — contratar un técnico verificado ahora variant=primary subtitle=Sin riesgos, con calificaciones reales:::`,
    category: "general",
    metaTitle: "7 errores al contratar técnico en Venezuela y cómo evitarlos",
    metaDescription: "Evita perder dinero al contratar un técnico en Venezuela. Los 7 errores más comunes y cómo protegerte con profesionales verificados en LinkServi.",
    isPublished: true,
    publishedAt: hoursAgo(6),
  },

  // ── 4. Fuga de agua ────────────────────────────────────────────────────────
  {
    slug: "fuga-agua-casa-que-hacer-venezuela",
    title: "Fuga de agua en casa: qué hacer primero (y por qué no esperar)",
    excerpt: "Una fuga de agua puede arruinar paredes, pisos y causar daños estructurales en días. Aquí está el protocolo exacto para actuar rápido y contratar bien.",
    contentMd: `## La fuga pequeña que se convierte en problema grande

Empieza como una mancha húmeda en la pared o un goteo casi imperceptible. Al principio parece menor. Pero las fugas de agua no desaparecen solas: crecen, se expanden y van dañando todo a su paso.

En Venezuela, donde los materiales de construcción y las reparaciones son costosas, esperar puede convertir un problema de $30 en uno de $300 o más.

:::cta href=/workers text=Plomeros disponibles hoy — ver horarios variant=primary subtitle=Emergencias atendidas el mismo día:::

## Primeros pasos cuando descubres una fuga

### 1. Cierra el paso del agua

Lo primero siempre: cierra la llave de paso principal de tu casa o apartamento. Esto detiene el flujo de agua y evita que el daño siga creciendo mientras buscas un plomero.

### 2. Registra el daño

Toma fotos o video del área afectada. Esto te sirve para dos cosas: mostrarle al plomero qué ocurrió exactamente, y tener documentación si necesitas hacer un reclamo.

### 3. Identifica si el daño está en tuberías internas o externas

- **Tubería interna** (dentro de la pared o piso): el agua sale sin que esté lloviendo, la pared se humedece sola
- **Tubería de entrada**: problemas en la conexión principal o en el medidor
- **Grifo o llave**: el problema está localizado en un punto específico

### 4. Llama a un plomero antes de intentar reparar tú mismo

Tapar una fuga con cinta o masilla puede funcionar horas o días, pero no es una solución. El daño sigue avanzando por dentro. Un profesional identifica la causa real y la repara correctamente.

:::cta href=/workers text=Encontrar un plomero cerca de ti ahora variant=primary:::

## ¿Cuánto puede costar reparar una fuga?

| Tipo de fuga | Costo estimado (USD) | Urgencia |
|---|---|---|
| Grifo o llave que gotea | $10 – $25 | Moderada |
| Tubería visible expuesta | $20 – $50 | Alta |
| Tubería dentro de pared | $50 – $180 | Muy alta |
| Tubería principal de entrada | $40 – $120 | Muy alta |
| Cisterna o tanque | $30 – $80 | Alta |

> El costo real depende de la ubicación de la fuga, el tipo de tubería y la ciudad. Siempre pide diagnóstico antes de aprobar la reparación.

## Señales de que el daño ya es serio

Algunos síntomas indican que la fuga lleva tiempo sin atención:

- Manchas de humedad que van creciendo en paredes o techo
- Olor a moho o humedad persistente en algún cuarto
- Pintura o revoque que se cae o se abomba
- Piso que cruje o cede en algún punto
- Caída repentina en la presión del agua

Si tienes alguno de estos síntomas, **no esperes más**. El daño estructural por humedad es uno de los más costosos de reparar y crece con el tiempo.

:::workers title=Plomeros disponibles para emergencias:::

## Cómo contratar un plomero confiable para una fuga

El error más común es contratar al primero que aparece en un momento de pánico, sin verificar nada. Cuando el problema es urgente, es fácil tomar malas decisiones.

La forma correcta:

1. Busca en LinkServi plomeros con calificaciones verificadas en tu ciudad
2. Describe el problema por mensaje antes de que lleguen
3. Pide un diagnóstico previo (muchos profesionales lo hacen sin costo)
4. Aprueba el presupuesto antes de que empiecen
5. No pagues el total hasta que el trabajo esté terminado y el agua fluya correctamente

:::cta href=/workers text=Ver plomeros con calificaciones reales en tu zona variant=primary subtitle=Disponibles hoy para emergencias:::`,
    category: "plomería",
    metaTitle: "Fuga de agua en casa Venezuela: qué hacer primero y cómo resolverlo",
    metaDescription: "Si tienes una fuga de agua en casa en Venezuela, actúa rápido. Guía paso a paso, costos reales y cómo encontrar un plomero confiable en LinkServi.",
    isPublished: true,
    publishedAt: hoursAgo(10),
  },

  // ── 5. Reparar o reemplazar ────────────────────────────────────────────────
  {
    slug: "reparar-o-reemplazar-electrodomestico-venezuela-2026",
    title: "¿Reparar o reemplazar? La guía definitiva para no gastar de más",
    excerpt: "¿Vale la pena reparar tu nevera, lavadora o televisor, o es mejor comprar uno nuevo? Esta guía te ayuda a decidir sin cometer errores costosos.",
    contentMd: `## La pregunta que todos evitamos responder bien

El lavador dejó de centrifugar. La nevera ya no enfría bien. El televisor tiene una línea en la pantalla. Y surge la duda: ¿lo reparo o compro uno nuevo?

La respuesta equivocada puede costarte mucho. Reparar algo que iba a romperse de nuevo en 3 meses es tirar dinero. Pero reemplazar algo que tenía solución sencilla tampoco tiene sentido.

Aquí está la metodología para decidir bien.

:::cta href=/workers text=Diagnóstico técnico antes de decidir — ver técnicos variant=primary subtitle=Saber qué tiene antes de gastar:::

## La regla del 50%

La guía básica más usada: **si la reparación cuesta más del 50% del precio de un equipo equivalente nuevo, generalmente conviene reemplazarlo**.

Ejemplo: si una lavadora nueva cuesta $280 y la reparación cuesta $160, estás en el límite. Si cuesta $200 o más, tiene más sentido reemplazarla.

Pero la regla del 50% no es absoluta. Hay factores adicionales que importan.

## Factores que pesan en la decisión

### Edad del equipo

Cada electrodoméstico tiene una vida útil estimada. Si el equipo ya superó ese tiempo, incluso una reparación exitosa puede ser temporal.

| Electrodoméstico | Vida útil estimada |
|---|---|
| Nevera | 10 – 15 años |
| Lavadora | 8 – 12 años |
| Secadora | 8 – 12 años |
| Aire acondicionado | 10 – 15 años |
| Televisor | 7 – 10 años |
| Microondas | 7 – 10 años |

Si el equipo tiene más del 75% de su vida útil, cada reparación es un parche.

### ¿Ha fallado antes?

Si es la segunda o tercera vez que el mismo equipo requiere reparación en poco tiempo, la probabilidad de que falle de nuevo es alta. En ese caso, el costo total acumulado suele superar el de un equipo nuevo.

### Disponibilidad de repuestos

En Venezuela, ciertos repuestos son difíciles de conseguir. Si el técnico te dice que el repuesto no se consigue fácil, considera que incluso si lo reparan hoy, una segunda falla puede dejarte sin solución.

:::cta href=/workers text=Técnicos que diagnostican antes de cobrar la reparación variant=primary:::

## Cuándo conviene reparar

- El equipo tiene menos del 50% de su vida útil
- La falla es específica y conocida (no sistémica)
- La reparación cuesta menos del 40% del precio de uno nuevo
- El repuesto está disponible y es confiable
- El equipo tiene características especiales que no consigues fácilmente hoy

## Cuándo conviene reemplazar

- El equipo tiene más de 10 años y ha fallado antes
- La reparación cuesta más del 60% de uno nuevo
- El técnico no puede garantizar cuánto durará la reparación
- El repuesto no está disponible o es muy costoso
- El consumo eléctrico del equipo es alto (los equipos más nuevos son más eficientes)

## El paso que la mayoría omite: el diagnóstico

El error más frecuente es decidir sin diagnóstico. Llevas el equipo a reparar porque crees que tiene cierto problema, el técnico cotiza por eso, y cuando abre el equipo descubre algo diferente — con un costo diferente.

**Lo correcto**: pide siempre un diagnóstico primero. Muchos técnicos lo hacen sin costo o con un cargo mínimo que se descuenta de la reparación. Con el diagnóstico en mano, puedes decidir con información real.

:::workers title=Técnicos con diagnóstico rápido disponibles ahora:::

## En resumen

La decisión no es blanco o negro. Depende de la edad del equipo, el costo de la reparación, la disponibilidad de repuestos y tu situación. Pero siempre empieza por el diagnóstico — es la única forma de decidir con información real en lugar de suposiciones.

:::cta href=/workers text=Consultar un técnico antes de decidir qué hacer variant=primary subtitle=Diagnóstico honesto y sin compromiso:::`,
    category: "general",
    metaTitle: "¿Reparar o reemplazar electrodoméstico en Venezuela? Guía 2026",
    metaDescription: "Aprende cuándo vale la pena reparar tu nevera, lavadora o AC en Venezuela y cuándo es mejor reemplazarlo. Guía con tabla de vida útil y regla del 50%.",
    isPublished: true,
    publishedAt: hoursAgo(14),
  },

  // ── 6. Co-Host / Gestión de negocios ──────────────────────────────────────
  {
    slug: "plan-cohost-linkservi-gestionar-servicios-ganar-comisiones",
    title: "Cómo ganar comisiones gestionando servicios y tiendas con el Plan Co-Host de LinkServi",
    excerpt: "El Plan Co-Host de LinkServi te permite administrar los negocios digitales de otros y ganar comisiones por cada venta y servicio gestionado. Así funciona el modelo.",
    contentMd: `## Un modelo de negocio basado en gestión, no en trabajo físico

Hay una diferencia entre hacer el trabajo tú mismo y administrar el negocio de alguien que lo hace. El segundo modelo puede ser igual o más rentable, requiere diferentes habilidades y tiene un techo de ingresos mucho más alto.

Eso es exactamente lo que hace el **Plan Co-Host de LinkServi**: te convierte en el administrador digital de los negocios de otros — profesionales, tiendas y prestadores de servicio que no tienen tiempo o conocimiento para manejar su presencia en la plataforma.

:::cta href=/cohost text=Ver el Plan Co-Host y comenzar variant=primary subtitle=Cupos limitados por ciudad:::

## ¿Qué hace un Co-Host en LinkServi?

Un Co-Host gestiona una o varias cuentas dentro de la plataforma. Dependiendo de lo que acuerdes con cada cliente, puedes encargarte de:

| Función | Qué implica |
|---|---|
| **Gestión del perfil** | Mantener actualizada la info, fotos, categorías y servicios del profesional |
| **Atención a clientes** | Responder mensajes, coordinar reservas, confirmar citas |
| **Gestión de tienda** | Actualizar inventario, precios y disponibilidad de productos |
| **Seguimiento de pedidos** | Coordinar entregas, informar estados al cliente |
| **Publicación de servicios** | Crear y optimizar el catálogo de servicios del profesional |
| **Reportes** | Informar al cliente sobre su actividad, ingresos y resultados |

El Co-Host no ejecuta el servicio — lo administra. El plomero plomea, el electricista instala, el vendedor vende. Tú gestionas que eso ocurra de la manera más eficiente posible.

## ¿Cómo funciona la comisión?

Por cada transacción que ocurra dentro de las cuentas que gestionas, recibes un porcentaje como comisión. Esto incluye:

- **Servicios contratados**: cada vez que un cliente contrata al profesional que gestionas
- **Ventas de tienda**: cada producto vendido en las tiendas que administras
- **Suscripciones y upgrades**: si el cliente decide mejorar su plan, tú participas de ese crecimiento

El porcentaje exacto depende del acuerdo con cada cliente y del nivel de gestión que ofrezcas. Cuanto más valor aportas, más puedes negociar.

:::cta href=/cohost text=Ver condiciones del Plan Co-Host variant=primary:::

## ¿Qué habilidades necesitas?

No necesitas ser técnico ni conocer el oficio que gestiona tu cliente. Lo que necesitas:

- **Organización**: responder a tiempo, no dejar mensajes sin atender
- **Comunicación clara**: con el cliente final y con el profesional
- **Manejo básico de plataformas digitales**: actualizar perfiles, subir fotos, usar el panel
- **Actitud de servicio**: tratar bien al cliente final como si fuera tu propio negocio

Es un rol que puede hacer alguien con buenas habilidades de organización y comunicación, sin importar su formación técnica.

## ¿Cuántas cuentas puede gestionar un Co-Host?

Depende de tu capacidad de respuesta. Un Co-Host que apenas empieza puede manejar 2-3 cuentas cómodamente. Con un sistema de trabajo claro, algunos Co-Hosts en LinkServi gestionan 8 o más cuentas simultáneamente.

El modelo escala porque:

- La atención al cliente se organiza en un mismo panel
- Los mensajes y reservas llegan centralizados
- Puedes delegar partes del proceso si creces

:::workers title=Profesionales en LinkServi que pueden necesitar un Co-Host:::

## ¿Por qué los profesionales necesitan un Co-Host?

La mayoría de los profesionales — plomeros, electricistas, carpinteros, vendedores — son muy buenos en lo que hacen pero no tienen tiempo ni habilidad para gestionar su presencia digital.

Responder mensajes mientras están trabajando en una instalación es imposible. Actualizar su perfil y subir fotos de sus trabajos nunca queda. Coordinar varias citas a la vez se vuelve caótico.

Ahí entra el Co-Host: cubre esa brecha, mejora la conversión del negocio del profesional y ambos ganan.

## Comenzar como Co-Host

El proceso es directo:

1. Activa el Plan Co-Host en tu cuenta de LinkServi
2. Contacta a profesionales o dueños de tienda que quieras gestionar
3. Define el acuerdo de comisión o pago fijo con cada uno
4. Empieza a gestionar sus cuentas desde tu panel
5. Recibe tu comisión automáticamente por cada transacción

LinkServi se encarga de la parte técnica — pagos, notificaciones, confirmaciones. Tú te encargás de la gestión.

:::cta href=/cohost text=Activar el Plan Co-Host y ver cupos disponibles variant=primary subtitle=Comienza a gestionar y generar ingresos:::`,
    category: "cohost",
    metaTitle: "Plan Co-Host LinkServi: gestiona negocios y gana comisiones en Venezuela",
    metaDescription: "Con el Plan Co-Host de LinkServi puedes administrar servicios y tiendas de otros profesionales y ganar comisiones por cada transacción gestionada en Venezuela.",
    isPublished: true,
    publishedAt: hoursAgo(18),
  },
];

export async function seedBlogArticlesV3() {
  for (const article of articles) {
    await db.insert(blogArticlesTable).values(article).onConflictDoNothing();
  }
}

if (process.argv[1]?.includes("seed-blog-v3")) {
  console.log(`[seed-blog-v3] Inserting ${articles.length} articles...`);
  seedBlogArticlesV3()
    .then(() => { console.log("[seed-blog-v3] Done."); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
