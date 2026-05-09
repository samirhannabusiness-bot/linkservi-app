import { db, usersTable, workersTable, categoriesTable, productsTable, storesTable, jobProfilesTable, rentalsTable, blogArticlesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./auth";
import { seedBlogArticlesV2 } from "./seed-blog-v2";
import { seedBlogArticlesV3 } from "./seed-blog-v3";

const CATEGORIES = [
  { name: "Plomería", description: "Instalación y reparación de tuberías, grifos y sistemas de agua", icon: "🔧", color: "#3B82F6" },
  { name: "Electricidad", description: "Instalaciones eléctricas, cableado y reparaciones eléctricas", icon: "⚡", color: "#F59E0B" },
  { name: "Carpintería", description: "Fabricación y reparación de muebles, puertas y estructuras en madera", icon: "🪵", color: "#92400E" },
  { name: "Pintura", description: "Pintura interior y exterior de viviendas y locales comerciales", icon: "🎨", color: "#8B5CF6" },
  { name: "Albañilería", description: "Construcción, remodelación y reparación de obras civiles", icon: "🏗️", color: "#6B7280" },
  { name: "Aire Acondicionado", description: "Instalación, mantenimiento y reparación de equipos de A/C", icon: "❄️", color: "#06B6D4" },
  { name: "Cerrajería", description: "Apertura, cambio y reparación de cerraduras y sistemas de seguridad", icon: "🔑", color: "#D97706" },
  { name: "Jardinería", description: "Diseño, mantenimiento y cuidado de jardines y áreas verdes", icon: "🌿", color: "#10B981" },
  { name: "Limpieza del Hogar", description: "Limpieza profunda y mantenimiento de hogares y apartamentos", icon: "🧹", color: "#EC4899" },
  { name: "Mudanzas", description: "Transporte y traslado de muebles y enseres", icon: "🚛", color: "#EF4444" },
  { name: "Cuidado de Personas Mayores", description: "Acompañamiento, cuidado y asistencia a adultos mayores en casa", icon: "👴", color: "#F97316" },
  { name: "Cuidado de Niños", description: "Niñeras, guarderías en casa y actividades recreativas para niños", icon: "👶", color: "#FB923C" },
  { name: "Cuidado de Mascotas", description: "Paseo, baño y cuidado de mascotas a domicilio", icon: "🐾", color: "#84CC16" },
  { name: "Clases Particulares", description: "Tutorías y refuerzo académico para bachillerato y universidad", icon: "📚", color: "#6366F1" },
  { name: "Clases de Idiomas", description: "Inglés, francés, italiano y otros idiomas a domicilio", icon: "🗣️", color: "#0EA5E9" },
  { name: "Reparación de Electrodomésticos", description: "Reparación de lavadoras, neveras, microondas y más", icon: "🛠️", color: "#475569" },
  { name: "Tecnología y Computación", description: "Soporte técnico, reparación de PC y laptops, instalación de redes", icon: "💻", color: "#1D4ED8" },
  { name: "Diseño y Fotografía", description: "Fotografía de eventos, diseño gráfico y edición de fotos", icon: "📷", color: "#DB2777" },
  { name: "Chef a Domicilio", description: "Preparación de comidas, catering y eventos gastronómicos en casa", icon: "👨‍🍳", color: "#DC2626" },
  { name: "Lavado de Vehículos", description: "Lavado, encerado y detailing de carros a domicilio", icon: "🚗", color: "#1E40AF" },
  { name: "Mecánica Automotriz", description: "Mantenimiento preventivo y reparaciones mecánicas a domicilio", icon: "🔩", color: "#374151" },
  { name: "Belleza y Estética", description: "Cortes de cabello, manicure, pedicure y maquillaje a domicilio", icon: "💅", color: "#F472B6" },
  { name: "Mensajería y Delivery", description: "Mandados, compras y entregas rápidas en moto por la ciudad", icon: "📦", color: "#F59E0B" },
  { name: "Soldadura y Herrería", description: "Trabajos de soldadura, rejas, portones y estructuras metálicas", icon: "🔥", color: "#7C3AED" },
  { name: "Medicina General", description: "Consultas médicas a domicilio, diagnósticos y atención primaria de salud", icon: "🩺", color: "#10B981" },
  { name: "Pediatría", description: "Atención médica especializada para bebés, niños y adolescentes", icon: "👶🏻", color: "#34D399" },
  { name: "Cardiología", description: "Consultas cardiológicas, evaluación y seguimiento de salud cardiovascular", icon: "❤️", color: "#EF4444" },
  { name: "Veterinaria", description: "Atención veterinaria a domicilio para mascotas: consultas, vacunas y tratamientos", icon: "🐶", color: "#F97316" },
  { name: "Técnico de Televisores", description: "Reparación y mantenimiento de televisores, pantallas y equipos audiovisuales", icon: "📺", color: "#6366F1" },
  { name: "Mecánico de Motos", description: "Mantenimiento, revisión y reparación de motocicletas a domicilio", icon: "🏍️", color: "#78716C" },
  { name: "Diseño Gráfico", description: "Creación de logos, material publicitario, identidad visual y artes digitales", icon: "🎨", color: "#A855F7" },
  { name: "Creador de Contenido Digital", description: "Influencers, creación de contenido para redes sociales, fotografía y video para marcas", icon: "📱", color: "#E1306C" },
  { name: "Cantante para Eventos", description: "Cantantes solistas para bodas, cumpleaños, fiestas corporativas y celebraciones", icon: "🎤", color: "#8B5CF6" },
  { name: "Mariachis y Serenatas", description: "Mariachis, tríos y serenatas para toda ocasión a domicilio", icon: "🎺", color: "#DC2626" },
  { name: "Grupo Musical y Bandas", description: "Bandas en vivo, conjuntos musicales y orquestas para eventos y fiestas", icon: "🎸", color: "#7C3AED" },
  { name: "Animación Infantil y Payasos", description: "Payasos, magos y animadores para fiestas y cumpleaños infantiles", icon: "🤡", color: "#F59E0B" },
  { name: "DJ y Sonido para Eventos", description: "DJ profesional, equipos de sonido e iluminación para fiestas y eventos", icon: "🎧", color: "#06B6D4" },
  { name: "Alquiler para Fiestas y Eventos", description: "Alquiler de sillas, mesas, carpas, brincolines y artículos para celebraciones", icon: "🎪", color: "#10B981" },
  { name: "Decoración de Eventos", description: "Decoración temática, arreglos florales y ambientación para bodas, cumpleaños y eventos", icon: "🎊", color: "#EC4899" },
  { name: "Bartender y Coctelería", description: "Bartenders profesionales, coctelería y servicio de barra para eventos y fiestas", icon: "🍹", color: "#0EA5E9" },
  { name: "Magia e Ilusionismo", description: "Shows de magia, ilusionismo y mentalismo para fiestas, eventos corporativos y cumpleaños", icon: "🪄", color: "#6366F1" },
];

export async function seedDemoData() {
  try {
    // Seed categories
    for (const cat of CATEGORIES) {
      await db.execute(sql`
        INSERT INTO categories (name, description, icon, color)
        VALUES (${cat.name}, ${cat.description}, ${cat.icon}, ${cat.color})
        ON CONFLICT (name) DO NOTHING
      `);
    }

    const passwordHash = await hashPassword("password");

    // Seed demo users
    const demoUsers = [
      { name: "Admin LinkServi", email: "admin@servilink.com", role: "admin" as const, phone: "+58-212-0000000" },
      { name: "Roberto Silva", email: "roberto@example.com", role: "client" as const, phone: "+58-412-5550105" },
      { name: "Valentina Ruiz", email: "valentina@example.com", role: "client" as const, phone: "+58-414-5550106" },
      { name: "Diego Torres", email: "diego@example.com", role: "client" as const, phone: "+58-416-5550107" },
      { name: "Carlos Mendoza", email: "carlos@example.com", role: "worker" as const, phone: "+58-424-5550201" },
      { name: "Ana García", email: "ana@example.com", role: "worker" as const, phone: "+58-426-5550202" },
      { name: "Luis Pérez", email: "luis@example.com", role: "worker" as const, phone: "+58-412-5550203" },
      { name: "María López", email: "maria@example.com", role: "worker" as const, phone: "+58-414-5550204" },
    ];

    const [cat1] = await db.select().from(categoriesTable).where(eq(categoriesTable.name, "Plomería"));
    const [cat2] = await db.select().from(categoriesTable).where(eq(categoriesTable.name, "Electricidad"));
    const [cat3] = await db.select().from(categoriesTable).where(eq(categoriesTable.name, "Carpintería"));
    const [cat4] = await db.select().from(categoriesTable).where(eq(categoriesTable.name, "Jardinería"));

    // Placeholder avatar so demo accounts bypass /profile/setup
    const DEMO_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=demo";

    for (const u of demoUsers) {
      const existing = await db.select().from(usersTable).where(eq(usersTable.email, u.email));
      if (existing.length > 0) {
        // Update password hash and ensure avatarUrl so demo users skip onboarding
        await db.update(usersTable).set({ passwordHash, avatarUrl: existing[0].avatarUrl ?? DEMO_AVATAR }).where(eq(usersTable.email, u.email));
        continue;
      }

      const [user] = await db.insert(usersTable).values({
        name: u.name,
        email: u.email,
        passwordHash,
        phone: u.phone,
        role: u.role,
        avatarUrl: DEMO_AVATAR,
      }).returning();

      if (u.role === "worker") {
        const catMap: Record<string, typeof cat1> = {
          "carlos@example.com": cat1,
          "ana@example.com": cat2,
          "luis@example.com": cat3,
          "maria@example.com": cat4,
        };
        const catForWorker = catMap[u.email];
        const pricingMap: Record<string, { base: number; service: number; desc: string; skills: string[] }> = {
          "carlos@example.com": { base: 10, service: 60, desc: "Plomero con 8 años de experiencia. Instalación y reparación de tuberías, grifería, cisternas y tanques. Trabajo garantizado.", skills: ["Tuberías", "Grifería", "Cisternas", "Sanitarios"] },
          "ana@example.com": { base: 15, service: 80, desc: "Electricista certificada. Instalaciones eléctricas residenciales y comerciales, tableros, tomacorrientes, aire acondicionado.", skills: ["Cableado", "Tableros eléctricos", "Tomacorrientes", "A/C"] },
          "luis@example.com": { base: 12, service: 70, desc: "Carpintero artesanal. Fabricación y reparación de muebles a medida, puertas, closets y cocinas.", skills: ["Muebles a medida", "Puertas", "Closets", "Cocinas"] },
          "maria@example.com": { base: 8, service: 45, desc: "Jardinera profesional. Diseño de jardines, poda, mantenimiento de áreas verdes y plantas de interior.", skills: ["Poda", "Diseño jardines", "Plantas de interior", "Riego"] },
        };
        const pricing = pricingMap[u.email] ?? { base: 10, service: 50, desc: `Profesional de ${catForWorker?.name ?? "servicios"} con amplia experiencia en Caracas.`, skills: [] };

        await db.insert(workersTable).values({
          userId: user.id,
          categoryId: catForWorker?.id ?? null as unknown as number,
          description: pricing.desc,
          skills: pricing.skills,
          basePrice: pricing.base,
          servicePrice: pricing.service,
          hourlyRate: pricing.base,
          fixedPrice: pricing.service,
          completedJobs: Math.floor(Math.random() * 30) + 5,
          earnings: (Math.random() * 500 + 100),
          rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
          reviewCount: Math.floor(Math.random() * 20) + 3,
          isAvailable: true,
          isVerified: false,
          verificationStatus: "pending",
          lat: 10.4806 + (Math.random() - 0.5) * 0.1,
          lng: -66.9036 + (Math.random() - 0.5) * 0.1,
        });
      }
    }

    // ── Seed demo cohost user + store + products ─────────────────────
    const cohostEmail = "cohost@servilink.com";
    let cohostId: number | null = null;

    const existingCohost = await db.select().from(usersTable).where(eq(usersTable.email, cohostEmail));
    if (existingCohost.length > 0) {
      cohostId = existingCohost[0].id;
      await db.update(usersTable).set({ passwordHash, avatarUrl: existingCohost[0].avatarUrl ?? DEMO_AVATAR }).where(eq(usersTable.email, cohostEmail));
    } else {
      const [ch] = await db.insert(usersTable).values({
        name: "Carlos Ramírez (Co-host Demo)",
        email: cohostEmail,
        passwordHash,
        phone: "+58-414-5551234",
        role: "cohost",
        avatarUrl: DEMO_AVATAR,
      }).returning();
      cohostId = ch.id;
    }

    if (cohostId) {
      // Demo store
      let storeId: number | null = null;
      const existingStore = await db.select().from(storesTable).where(eq(storesTable.coHostId, cohostId));
      if (existingStore.length > 0) {
        storeId = existingStore[0].id;
      } else {
        const [store] = await db.insert(storesTable).values({
          name: "Ferretería El Venezolano",
          description: "Todo para tu hogar y construcción. Materiales, herramientas y más.",
          ownerName: "Carlos Ramírez",
          ownerPhone: "+58-414-5551234",
          coHostId: cohostId,
          platformCommissionPct: 10,
          cohostCommissionPct: 5,
          paymentMethod: "pago_movil",
          paymentDetails: JSON.stringify({ bank: "Banesco", phone: "+58-414-5551234", cedula: "V-12345678" }),
        }).returning();
        storeId = store.id;
      }

      // Demo products around Caracas, Venezuela with real coordinates
      const DEMO_PRODUCTS = [
        {
          name: "Taladro Percutor 800W Profesional",
          description: "Taladro de impacto con accesorios incluidos, ideal para albañilería y carpintería.",
          priceUsd: 45.00, category: "ferretería", condition: "new", hasDelivery: true,
          latitude: 10.4806, longitude: -66.9036, stock: 8,
          listingType: "rental", rentalPricePerDay: 8.00, rentalPricePerWeek: 45.00,
          rentalDeposit: 25.00, rentalRules: "Devolver en el mismo estado. Incluye accesorios originales.",
        },
        {
          name: "Cargador de Batería Universal 12V",
          description: "Cargador inteligente para baterías de carros y motos. Detecta carga automáticamente.",
          priceUsd: 22.50, category: "repuestos automotriz", condition: "new", hasDelivery: true,
          latitude: 10.4870, longitude: -66.8980, stock: 15,
        },
        {
          name: "Licuadora Industrial 1.5L",
          description: "Licuadora de alto rendimiento, ideal para jugos, batidos y cocina profesional.",
          priceUsd: 35.00, category: "hogar y muebles", condition: "new", hasDelivery: true,
          latitude: 10.4750, longitude: -66.9100, stock: 5,
        },
        {
          name: "Casco de Construcción Certificado",
          description: "Casco de seguridad ANSI/ISEA certificado, ajustable, varios colores.",
          priceUsd: 8.00, category: "materiales de construcción", condition: "new", hasDelivery: false,
          latitude: 10.4920, longitude: -66.8870, stock: 30,
        },
        {
          name: "Teléfono Samsung Galaxy A15 128GB",
          description: "Smartphone desbloqueado, 4GB RAM, pantalla AMOLED 6.5\", cámara 50MP. Perfecto estado.",
          priceUsd: 180.00, category: "electrónica", condition: "used", hasDelivery: true,
          latitude: 10.4680, longitude: -66.9150, stock: 2,
        },
        {
          name: "Compresor de Aire 25 Litros",
          description: "Compresor monofásico 2HP, ideal para pintura, herramientas neumáticas y más.",
          priceUsd: 120.00, category: "ferretería", condition: "new", hasDelivery: false,
          latitude: 10.5010, longitude: -66.9050, stock: 3,
        },
        {
          name: "Kit de Herramientas 50 Piezas",
          description: "Set completo con llaves, destornilladores, alicates, martillo y caja metálica.",
          priceUsd: 28.00, category: "ferretería", condition: "new", hasDelivery: true,
          latitude: 10.4830, longitude: -66.8940, stock: 12,
        },
        {
          name: "Nevera Samsung 260L No Frost",
          description: "Nevera en excelente estado, bajo consumo eléctrico, se entrega con compresor revisado.",
          priceUsd: 350.00, category: "hogar y muebles", condition: "used", hasDelivery: false,
          latitude: 10.4760, longitude: -66.9200, stock: 1,
        },
      ];

      for (const p of DEMO_PRODUCTS) {
        const existing = await db.select({ id: productsTable.id }).from(productsTable)
          .where(eq(productsTable.name, p.name));
        if (existing.length === 0) {
          await db.insert(productsTable).values({
            ...p,
            coHostId: cohostId,
            storeId: storeId ?? undefined,
            isActive: true,
          });
        } else {
          // Update coordinates, stock and rental fields on existing products
          const updateData: Record<string, any> = {
            latitude: p.latitude,
            longitude: p.longitude,
            storeId: storeId ?? null,
            stock: p.stock,
          };
          if ((p as any).listingType) {
            updateData.listingType = (p as any).listingType;
            updateData.rentalPricePerDay = (p as any).rentalPricePerDay ?? null;
            updateData.rentalPricePerWeek = (p as any).rentalPricePerWeek ?? null;
            updateData.rentalDeposit = (p as any).rentalDeposit ?? null;
            updateData.rentalRules = (p as any).rentalRules ?? null;
          }
          await db.update(productsTable).set(updateData).where(eq(productsTable.name, p.name));
        }
      }
    }

    // Migrate existing workers: set basePrice/servicePrice from hourlyRate/fixedPrice if not set
    await db.execute(sql`
      UPDATE workers
      SET base_price = COALESCE(base_price, hourly_rate, 10),
          service_price = COALESCE(service_price, fixed_price, hourly_rate * 3, 50)
      WHERE base_price IS NULL OR base_price = 0
    `);

    // ── Seed demo job profiles (Bolsa de Empleo) ─────────────────────────────
    const JOB_PROFILES: { email: string; bio: string; city: string; skills: string[]; experience: { company: string; role: string; years: number; companyPhone?: string }[]; subscribed?: boolean }[] = [
      {
        email: "carlos@example.com",
        bio: "Plomero con 8 años de experiencia en instalación y reparación de tuberías, grifería, cisternas y sistemas de agua. Trabajo con garantía y materiales de calidad. Disponible inmediatamente en Maturín y alrededores.",
        city: "Maturín",
        skills: ["Tuberías PVC", "Grifería", "Cisternas y tanques", "Instalación sanitaria", "Reparación de fugas"],
        experience: [
          { company: "Constructora Del Sur", role: "Plomero Oficial", years: 5, companyPhone: "04141234567" },
          { company: "Trabajos Independientes", role: "Plomero Autónomo", years: 3 },
        ],
        subscribed: true,
      },
      {
        email: "ana@example.com",
        bio: "Electricista certificada con 6 años en instalaciones eléctricas residenciales y comerciales. Especialista en tableros eléctricos, tomacorrientes, cableado y sistemas de aire acondicionado. Garantía en todos mis trabajos.",
        city: "Maturín",
        skills: ["Cableado residencial", "Tableros eléctricos", "Tomacorrientes 110V/220V", "Instalación de A/C", "Iluminación LED"],
        experience: [
          { company: "Electrónica Monagas C.A.", role: "Técnico Electricista", years: 4, companyPhone: "04161234567" },
          { company: "Freelance", role: "Electricista Independiente", years: 2 },
        ],
        subscribed: false,
      },
      {
        email: "luis@example.com",
        bio: "Carpintero artesanal con más de 10 años fabricando muebles a medida. Especialidad en closets empotrados, cocinas integrales, puertas y revestimientos de madera. Cada pieza es única y hecha con pasión.",
        city: "Caracas",
        skills: ["Muebles a medida", "Closets empotrados", "Cocinas integrales", "Puertas de madera", "Restauración de muebles"],
        experience: [
          { company: "Mueblería El Artesano", role: "Maestro Carpintero", years: 7, companyPhone: "02121234567" },
          { company: "Independiente", role: "Carpintero Autónomo", years: 3 },
        ],
        subscribed: false,
      },
      {
        email: "maria@example.com",
        bio: "Jardinera profesional con experiencia en diseño y mantenimiento de jardines residenciales y comerciales. Especializada en plantas tropicales venezolanas, poda ornamental y sistemas de riego automatizado.",
        city: "Maturín",
        skills: ["Diseño de jardines", "Poda ornamental", "Plantas tropicales", "Riego automatizado", "Fertilización orgánica"],
        experience: [
          { company: "Paisajismo Verde C.A.", role: "Diseñadora de Jardines", years: 4, companyPhone: "04121234567" },
          { company: "Servicios Propios", role: "Jardinera Autónoma", years: 3 },
        ],
        subscribed: false,
      },
    ];

    for (const jp of JOB_PROFILES) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.email, jp.email));
      if (!u) continue;
      const existingJp = await db.select({ id: jobProfilesTable.id }).from(jobProfilesTable).where(eq(jobProfilesTable.userId, u.id));
      const subEnd = jp.subscribed ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
      if (existingJp.length === 0) {
        await db.insert(jobProfilesTable).values({
          userId: u.id,
          bio: jp.bio,
          city: jp.city,
          skills: JSON.stringify(jp.skills),
          workExperience: JSON.stringify(jp.experience),
          isAvailable: true,
          subscriptionEnd: subEnd,
        });
      } else {
        // Keep existing but update subscriptionEnd for carlos so demo shows "Destacado"
        if (jp.subscribed) {
          await db.update(jobProfilesTable).set({ subscriptionEnd: subEnd }).where(eq(jobProfilesTable.userId, u.id));
        }
      }
    }

    // ── Seed demo rental ─────────────────────────────────────────────────────
    const [firstProduct] = await db.select().from(productsTable).limit(1);
    const [clientUser] = await db.select().from(usersTable).where(eq(usersTable.email, "roberto@example.com"));
    const [ownerUser] = await db.select().from(usersTable).where(eq(usersTable.email, cohostEmail ?? "cohost@servilink.com"));
    if (firstProduct && clientUser && ownerUser) {
      const existingRental = await db.select({ id: rentalsTable.id }).from(rentalsTable).where(eq(rentalsTable.productId, firstProduct.id));
      if (existingRental.length === 0) {
        await db.insert(rentalsTable).values({
          productId: firstProduct.id,
          clientId: clientUser.id,
          ownerId: ownerUser.id,
          startDate: "2026-04-22",
          endDate: "2026-04-28",
          days: 6,
          dailyRate: 12.00,
          subtotal: 72.00,
          commission: 10.80,
          depositAmount: 50.00,
          depositStatus: "held",
          status: "active",
          clientNotes: "Por favor tener el equipo listo temprano en la mañana.",
          productName: firstProduct.name,
          ownerName: ownerUser.name,
          clientName: clientUser.name,
        });
      }
    }

    await seedBlogArticles();
    await seedBlogArticlesV2();
    await seedBlogArticlesV3();
    console.log("[seed] Demo data ready");
  } catch (e) {
    console.error("[seed] Error seeding demo data:", e);
  }
}

async function seedBlogArticles() {
  const NOW = new Date();
  const articles = [
    {
      slug: "como-contratar-plomero-venezuela",
      title: "Cómo contratar un plomero en Venezuela: guía paso a paso",
      excerpt: "Antes de llamar al primero que consigas, lee esto. Te enseñamos qué preguntar, cómo comparar precios y cómo evitar estafas al contratar un plomero en Venezuela.",
      contentMd: `## ¿Por qué es tan importante elegir bien a tu plomero?\n\nUna mala contratación puede costarte el doble: pagas la reparación y después pagas arreglar los daños que dejó el trabajo mal hecho. En Venezuela, donde los materiales escasean y los repuestos son costosos en dólares, un error de plomería puede convertirse en una pesadilla.\n\nEsta guía te dice exactamente qué hacer.\n\n---\n\n## 1. Define el problema antes de llamar\n\nAntes de contactar a nadie, identifica lo que puedes:\n\n- **¿Gotea o hay una rotura total?** Una fuga lenta puede ser una llave o sello. Una rotura es urgente.\n- **¿El problema es visible?** Si el agua viene de detrás de la pared, es más complejo.\n- **¿Tienes agua acumulada?** Si hay agua en el piso, toma fotos antes de limpiar — sirven de evidencia y ayudan al plomero a diagnosticar.\n\nCuanto más claro seas al describir el problema, más preciso será el presupuesto.\n\n---\n\n## 2. Busca plomeros verificados, no cualquiera\n\nEl error más común es llamar al primero que te recomienda un vecino sin pedir referencias. En LinkServi puedes ver:\n\n- **Reseñas verificadas** de clientes reales\n- **Trabajos anteriores** en foto\n- **Precio estimado** por servicio\n- **Disponibilidad** en tu ciudad\n\n:::cta href="/servicios/plomeria" text="Ver plomeros disponibles" variant="primary" subtitle="Perfiles verificados con reseñas reales":::\n\n---\n\n## 3. Pide al menos 2 presupuestos\n\nNunca aceptes el primer precio sin comparar. Al pedir presupuesto, pregunta:\n\n- **¿Incluye los materiales?** Muchos dan precio sin mano de obra ni materiales.\n- **¿Qué garantía ofrece?** Un buen plomero respalda su trabajo mínimo 30 días.\n- **¿Cuánto tiempo tomará?** Un trabajo sin fecha de entrega puede alargarse.\n\n---\n\n## 4. Red flags: cuándo NO contratar a alguien\n\nDescarta al profesional si:\n\n- No puede decirte el precio aproximado antes de ver el trabajo.\n- Pide el 100% del pago por adelantado.\n- No tiene forma de contacto verificable.\n- No puede darte el nombre completo ni mostrar experiencia anterior.\n\n---\n\n## 5. Cómo pagar de forma segura\n\n- **Paga máximo el 50% adelantado**, el resto al terminar.\n- **Exige recibo o comprobante** aunque sea por WhatsApp.\n- **No pagues extra "en mano"** sin que quede registro.\n\n:::cta href="/servicios/plomeria" text="Buscar plomero ahora" variant="secondary" subtitle="Gratis, sin registro obligatorio":::`,
      coverImageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80",
      coverAlt: "Plomero trabajando en instalación de tuberías en Venezuela",
      metaTitle: "Cómo contratar un plomero en Venezuela 2025 | Guía completa",
      metaDescription: "Aprende paso a paso cómo contratar un plomero confiable en Venezuela: qué preguntar, cómo comparar precios y evitar estafas. Guía actualizada 2025.",
      category: "plomeria",
      tags: ["plomero", "Venezuela", "contratar", "guía", "presupuesto"],
      vertical: "servicios",
      authorName: "Equipo LinkServi",
      readMinutes: 5,
      isPublished: true,
      publishedAt: new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "cuanto-cobra-electricista-venezuela-2025",
      title: "¿Cuánto cobra un electricista en Venezuela? Precios reales 2025",
      excerpt: "Descubre los precios actualizados de los servicios eléctricos en Venezuela: desde cambiar un tomacorriente hasta instalar un tablero. Precios en dólares y bolívares.",
      contentMd: `## Entender los precios antes de llamar\n\nEl primer error al contratar a un electricista es no saber si el precio que te dan es razonable. Sin una referencia, cualquier número suena bien — o mal.\n\n---\n\n## Servicios básicos y sus precios aproximados\n\n> ⚠️ Los precios varían por ciudad, complejidad y si incluyen materiales. Rangos orientativos en **USD**.\n\n### Instalaciones menores\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Cambiar tomacorriente o interruptor | $5 – $15 |\n| Instalar lámpara o abanico de techo | $10 – $25 |\n| Revisar y reparar falla eléctrica simple | $10 – $30 |\n| Instalar toma para aire acondicionado | $20 – $50 |\n\n### Instalaciones mayores\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Instalar o reemplazar tablero de breakers | $80 – $200 |\n| Instalación eléctrica completa (apartamento) | $300 – $800 |\n| Cableado para planta eléctrica o inversor | $60 – $150 |\n\n---\n\n## ¿Por qué varía tanto el precio?\n\n1. **Materiales**: Cables y breakers son importados. Su precio cambia con el dólar.\n2. **Ciudad**: En Caracas los precios tienden a ser más altos.\n3. **Urgencia**: Mismo día puede costar entre 20% y 50% más.\n\n---\n\n## Cómo saber si te están cobrando de más\n\nPide que el presupuesto sea **detallado por ítem**: mano de obra, materiales, tiempo estimado.\n\n:::cta href="/servicios/electricidad" text="Ver electricistas verificados" variant="primary" subtitle="Con reseñas, experiencia y precios aproximados":::`,
      coverImageUrl: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1200&q=80",
      coverAlt: "Electricista trabajando en tablero de breakers en Venezuela",
      metaTitle: "Precios de electricista en Venezuela 2025 | Tabla de costos real",
      metaDescription: "Cuánto cobra un electricista en Venezuela en 2025. Precios reales en USD para tomacorrientes, tableros, instalaciones y más.",
      category: "electricidad",
      tags: ["electricista", "Venezuela", "precios", "2025", "tablero"],
      vertical: "servicios",
      authorName: "Equipo LinkServi",
      readMinutes: 4,
      isPublished: true,
      publishedAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "5-senales-instalacion-electrica-necesita-revision",
      title: "5 señales de que tu instalación eléctrica necesita revisión urgente",
      excerpt: "Chispas, apagones frecuentes, calor en los tomacorrientes... ¿cuántas de estas señales tiene tu casa? Aprende a identificarlas antes de que sea tarde.",
      contentMd: `## La instalación eléctrica que nadie revisa\n\nLa mayoría de las instalaciones eléctricas en Venezuela tienen entre 20 y 40 años. El resultado: cables viejos bajo carga nueva — una combinación peligrosa.\n\n---\n\n## Señal 1: Los interruptores (breakers) saltan con frecuencia\n\nSi tu tablero "bota" la luz constantemente, es una advertencia: el circuito está sobrecargado o el breaker está fallando.\n\n**Lo que debes hacer**: No repongas el breaker una y otra vez. Llama a un electricista para que revise la carga real.\n\n---\n\n## Señal 2: Tomacorrientes o interruptores calientes al tacto\n\nUn tomacorriente **caliente** o con olor a quemado indica conexiones flojas que generan arco eléctrico. Esto puede provocar un incendio.\n\n---\n\n## Señal 3: Luces que parpadean o se van solas\n\nSi tus luces parpadean cuando enciendes un electrodoméstico, el problema es la tensión de la línea: conexión suelta, cables subdimensionados o problema en la red pública.\n\n---\n\n## Señal 4: Cables pelados, empalmes con cinta o instalaciones "colgadas"\n\nEstas "soluciones" temporales son las más comunes en Venezuela y también las que más incendios eléctricos generan.\n\n---\n\n## Señal 5: La instalación tiene más de 20 años y nunca fue revisada\n\nUna revisión preventiva cuesta mucho menos que reparar los daños de un incendio o un cortocircuito.\n\n:::cta href="/servicios/electricidad" text="Buscar electricista ahora" variant="primary" subtitle="Disponibles en tu ciudad, con reseñas verificadas":::`,
      coverImageUrl: "https://images.unsplash.com/photo-1558449028-b53a39d100fc?w=1200&q=80",
      coverAlt: "Tablero eléctrico con breakers en casa venezolana",
      metaTitle: "5 señales de peligro eléctrico en tu casa | Venezuela 2025",
      metaDescription: "¿Breakers que saltan, tomacorrientes calientes, luces que parpadean? Estas 5 señales indican que tu instalación eléctrica necesita revisión urgente.",
      category: "electricidad",
      tags: ["electricidad", "seguridad", "instalación", "señales", "Venezuela"],
      vertical: "servicios",
      authorName: "Equipo LinkServi",
      readMinutes: 5,
      isPublished: true,
      publishedAt: new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "guia-contratar-albanil-venezuela",
      title: "Guía para contratar un albañil en Venezuela: qué evaluar antes de empezar",
      excerpt: "Remodelación, construir un cuarto extra, arreglar una pared dañada... Sea cual sea tu proyecto, contratar bien al albañil es la clave del éxito.",
      contentMd: `## El mayor error al contratar un albañil\n\nEmpezar la obra sin acuerdo por escrito. En Venezuela, la informalidad hace que los proyectos frecuentemente se alarguen, se encarezcan o queden a medias.\n\n---\n\n## Paso 1: Define tu proyecto con el mayor detalle posible\n\nAntes de pedir presupuesto, prepara medidas del área, tipo de trabajo, materiales disponibles y plazo esperado.\n\n---\n\n## Paso 2: Pide presupuesto detallado, no global\n\nEvita presupuestos del tipo *"todo eso te sale en $500"*. Pide desglose por mano de obra, materiales y tiempo estimado.\n\n---\n\n## Paso 3: Evalúa la experiencia real\n\nPide fotos de trabajos anteriores y referencias de clientes recientes que puedas llamar.\n\n---\n\n## Paso 4: Acuerda la estructura de pago\n\n- **30–40%** al inicio\n- **30–40%** a la mitad del avance\n- **20–30%** al terminar y quedar satisfecho\n\nNunca pagues el 100% adelantado.\n\n:::cta href="/servicios/albanileria" text="Ver albañiles verificados cerca de ti" variant="primary" subtitle="Reseñas reales, precios aproximados, disponibilidad":::`,
      coverImageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
      coverAlt: "Albañil trabajando en construcción en Venezuela",
      metaTitle: "Cómo contratar un albañil en Venezuela 2025 | Guía completa",
      metaDescription: "Aprende a contratar un albañil confiable en Venezuela: presupuesto detallado, estructura de pago, cómo verificar experiencia y evitar estafas.",
      category: "albanileria",
      tags: ["albañil", "construcción", "Venezuela", "contratar", "presupuesto"],
      vertical: "servicios",
      authorName: "Equipo LinkServi",
      readMinutes: 6,
      isPublished: true,
      publishedAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "como-ganar-dinero-ofreciendo-servicios-venezuela",
      title: "Cómo ganar dinero en dólares ofreciendo servicios en Venezuela",
      excerpt: "Si sabes plomería, electricidad, carpintería o cualquier oficio, puedes ganar en dólares hoy mismo. Te explicamos cómo formalizarte y conseguir clientes.",
      contentMd: `## El mercado de servicios en Venezuela está creciendo\n\nCada vez más venezolanos necesitan profesionales para sus hogares y prefieren pagar en dólares a alguien de confianza. Si tienes un oficio, tienes una fuente de ingresos real.\n\n---\n\n## ¿Qué oficios tienen más demanda?\n\n1. **Plomería** — fugas, cisternas, instalaciones\n2. **Electricidad** — tableros, tomacorrientes, plantas eléctricas\n3. **Albañilería** — remodelaciones, reparaciones\n4. **Carpintería** — puertas, muebles, ventanas\n5. **Mecánica general** — mantenimiento de vehículos\n\n---\n\n## Fija precios en dólares\n\nCobrar en bolívares sin referencia al dólar es una trampa. Define tu precio en **USD** y acepta bolívares a la tasa del día.\n\n---\n\n## ¿Cuánto puedes ganar?\n\n- Un plomero con 3–4 trabajos semanales: **$300 a $700/mes**\n- Un electricista con tableros e instalaciones: **$400 a $1.000/mes**\n- Un carpintero con proyectos de muebles: **$500 a $1.200/mes**\n\n:::cta href="/unirme" text="Crear mi perfil de profesional gratis" variant="primary" subtitle="En LinkServi tu perfil llega a clientes en toda Venezuela":::`,
      coverImageUrl: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80",
      coverAlt: "Profesional de servicios venezolano con herramientas de trabajo",
      metaTitle: "Cómo ganar dinero con tu oficio en Venezuela 2025 | Guía práctica",
      metaDescription: "Si sabes plomería, electricidad, carpintería u otro oficio, puedes ganar en dólares en Venezuela. Aprende a conseguir clientes y fijar precios correctamente.",
      category: "empleo",
      tags: ["ganar dinero", "Venezuela", "oficios", "dólares", "freelance"],
      vertical: "empleo",
      authorName: "Equipo LinkServi",
      readMinutes: 6,
      isPublished: true,
      publishedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "reparaciones-hogar-mas-solicitadas-venezuela",
      title: "Los 7 servicios del hogar más solicitados en Venezuela (y cuánto cuestan)",
      excerpt: "Desde fugas de agua hasta instalaciones eléctricas: estos son los trabajos más pedidos en hogares venezolanos y los precios que manejan los profesionales en 2025.",
      contentMd: `## ¿En qué gastan más los venezolanos en servicios del hogar?\n\nBasándonos en las solicitudes en LinkServi, estos son los 7 servicios más pedidos — con precios de referencia actualizados a 2025.\n\n---\n\n## 1. Reparación de fugas y tuberías (Plomería)\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Reparar fuga en tubería visible | $15 – $40 |\n| Cambiar llave de paso o grifo | $10 – $25 |\n| Desatascar tuberías | $20 – $50 |\n| Reparar cisterna | $30 – $80 |\n\n:::cta href="/servicios/plomeria" text="Buscar plomero" variant="primary" subtitle="Disponibles en tu ciudad":::\n\n---\n\n## 2. Electricidad\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Cambiar tomacorriente o interruptor | $5 – $15 |\n| Revisar y reparar falla eléctrica | $15 – $35 |\n| Revisar tablero completo | $30 – $80 |\n\n---\n\n## 3. Pintura interior y exterior\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Pintar habitación (incluyendo material) | $40 – $100 |\n| Pintar fachada exterior | $80 – $300 |\n| Impermeabilización de techo | $80 – $250 |\n\n---\n\n## 4. Albañilería\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Pañetar o revocar pared | $20 – $60 por m² |\n| Colocar cerámica (mano de obra) | $15 – $40 por m² |\n| Reparar grieta estructural | $40 – $150 |\n\n---\n\n## 5. Carpintería y puertas/ventanas\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Reparar puerta que no cierra bien | $15 – $35 |\n| Colocar cerradura nueva | $15 – $40 |\n| Fabricar mueble a medida | $80 – $400 |\n\n---\n\n## 6. Aire acondicionado\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Limpieza y mantenimiento de split | $20 – $40 |\n| Instalación de split nuevo | $60 – $120 |\n| Carga de gas refrigerante | $30 – $60 |\n\n---\n\n## 7. Limpieza profunda\n\n| Servicio | Rango estimado (USD) |\n|----------|----------------------|\n| Limpieza profunda de apartamento | $30 – $80 |\n| Fumigación del hogar | $30 – $70 |\n\n:::cta href="/search" text="Buscar profesional por servicio" variant="secondary" subtitle="Filtros por ciudad, categoría y precio":::`,
      coverImageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80",
      coverAlt: "Herramientas de mantenimiento del hogar sobre superficie de madera",
      metaTitle: "7 servicios del hogar más pedidos en Venezuela 2025 | Precios reales",
      metaDescription: "Plomería, electricidad, pintura, albañilería y más: descubre los 7 servicios más solicitados en hogares venezolanos y sus precios actualizados 2025.",
      category: "hogar",
      tags: ["servicios hogar", "Venezuela", "precios", "2025", "mantenimiento"],
      vertical: "servicios",
      authorName: "Equipo LinkServi",
      readMinutes: 5,
      isPublished: true,
      publishedAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const article of articles) {
    await db.insert(blogArticlesTable).values(article).onConflictDoNothing();
  }
}
