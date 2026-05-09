/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KYC Automático — Gemini Vision (Replit AI Integrations)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Compara la selfie del usuario contra la foto de su documento (cédula/licencia)
 * usando el modelo de visión de Gemini.
 *
 * Umbrales:
 *   ≥ 85% similitud → aprobación automática (isVerified=true, imágenes borradas)
 *   < 85% similitud → queda en "pending" para revisión manual del admin
 *
 * Las variables AI_INTEGRATIONS_GEMINI_BASE_URL y AI_INTEGRATIONS_GEMINI_API_KEY
 * son provisionadas automáticamente por Replit — no requieren configuración manual.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { GoogleGenAI } from "@google/genai";
import { db, workersTable, userVerificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createNotification } from "../routes/notifications";
import { ObjectStorageService } from "./objectStorage";

const objectStorage = new ObjectStorageService();

// ── Thresholds ────────────────────────────────────────────────────────────────
const AUTO_APPROVE_THRESHOLD = 85; // >= 85% → aprobación automática

// ── Gemini client ─────────────────────────────────────────────────────────────
function buildGeminiClient(): GoogleGenAI {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "placeholder";

  if (!baseUrl) {
    throw new Error("AI_INTEGRATIONS_GEMINI_BASE_URL no configurada");
  }

  return new GoogleGenAI({ apiKey, httpOptions: { baseUrl } });
}

export function isKYCConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL?.trim();
}

// ── Fetch imagen de Object Storage y convertir a base64 ──────────────────────
async function fetchImageAsBase64(storagePath: string): Promise<{ data: string; mimeType: string }> {
  const normalized = storagePath
    .replace(/^\/api\/storage/, "")
    .replace(/^\/storage/, "");

  const file     = await objectStorage.getObjectEntityFile(normalized);
  const response = await objectStorage.downloadObject(file);
  const buffer   = await response.arrayBuffer();
  const base64   = Buffer.from(buffer).toString("base64");

  // Detectar mime type por extensión; caer en jpeg por defecto
  const ext      = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  return { data: base64, mimeType };
}

// ── Borrar imagen del object storage (best-effort) ───────────────────────────
async function deleteStorageObject(storagePath: string): Promise<void> {
  try {
    const normalized = storagePath
      .replace(/^\/api\/storage/, "")
      .replace(/^\/storage/, "");
    const file = await objectStorage.getObjectEntityFile(normalized);
    await file.delete();
  } catch (err) {
    console.warn("[KYC] No se pudo borrar imagen:", storagePath, err);
  }
}

// ── Resultado del análisis KYC ────────────────────────────────────────────────
export interface KYCResult {
  outcome: "approved" | "manual_review" | "skipped" | "error";
  similarity: number;
  documentNumber: string | null;
  message: string;
}

// ── Analizar imágenes con Gemini Vision ───────────────────────────────────────
async function analyzeWithGemini(
  documentImageUrl: string,
  selfieImageUrl: string,
): Promise<{ similarity: number; documentNumber: string | null }> {

  const [docImage, selfieImage] = await Promise.all([
    fetchImageAsBase64(documentImageUrl),
    fetchImageAsBase64(selfieImageUrl),
  ]);

  const ai     = buildGeminiClient();
  const prompt = `Eres un sistema de verificación de identidad. Analiza estas dos imágenes:
- IMAGEN 1: Foto del documento de identidad (cédula de identidad o licencia de conducir venezolana)
- IMAGEN 2: Selfie del usuario en tiempo real

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código:
{
  "similarity": <número entero del 1 al 100 que representa qué tan probable es que la persona del documento sea la misma de la selfie>,
  "documentNumber": "<número de cédula o licencia extraído del documento, o null si no se puede leer>"
}

Criterios para la similitud:
- 90-100: Claramente la misma persona, rasgos faciales muy similares
- 75-89: Probablemente la misma persona con algunas diferencias (edad, iluminación, ángulo)
- 50-74: Dudoso, diferencias notables pero no concluyente
- 1-49: Probablemente personas diferentes o imagen de muy baja calidad`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: docImage.mimeType,    data: docImage.data    } },
          { inlineData: { mimeType: selfieImage.mimeType, data: selfieImage.data } },
          { text: prompt },
        ],
      },
    ],
    config: { maxOutputTokens: 256 },
  });

  const raw = response.text ?? "";

  // Extraer JSON de la respuesta (Gemini a veces añade texto extra)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("[KYC] Gemini no retornó JSON válido:", raw);
    throw new Error("Respuesta de IA no parseable");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { similarity?: number; documentNumber?: string | null };
  const similarity     = Math.round(Math.min(100, Math.max(0, Number(parsed.similarity ?? 0))));
  const documentNumber = parsed.documentNumber ? String(parsed.documentNumber).trim() : null;

  return { similarity, documentNumber };
}

// ── Procesador principal de KYC ───────────────────────────────────────────────
// Llamar esta función tras guardar los documentos en DB (fire-and-forget).
// Si falla o Gemini no está disponible → el usuario queda en "pending" para
// revisión manual; el flujo nunca se interrumpe.
export async function processVerificationKYC(
  userId: number,
  verificationId: number,
  documentImageUrl: string,
  selfieImageUrl: string,
  userRole: string,
): Promise<KYCResult> {

  // ── Guardia de seguridad: ambas URLs deben ser strings no vacíos ─────────
  if (!documentImageUrl || typeof documentImageUrl !== "string" || !documentImageUrl.trim() ||
      !selfieImageUrl   || typeof selfieImageUrl   !== "string" || !selfieImageUrl.trim()) {
    console.warn(`[KYC] URLs de imágenes inválidas para usuario ${userId} — abortando KYC`);
    return { outcome: "skipped", similarity: 0, documentNumber: null, message: "Imágenes no disponibles — revisión manual" };
  }

  // ── Sin integración configurada → cola manual ─────────────────────────────
  if (!isKYCConfigured()) {
    console.log(`[KYC] Integración no disponible — usuario ${userId} → revisión manual`);
    return { outcome: "skipped", similarity: 0, documentNumber: null, message: "KYC no disponible" };
  }

  try {
    console.log(`[KYC] Analizando identidad del usuario ${userId}...`);

    const { similarity, documentNumber } = await analyzeWithGemini(documentImageUrl, selfieImageUrl);

    console.log(`[KYC] Usuario ${userId} — Similitud: ${similarity}% | Cédula detectada: ${documentNumber ?? "no detectada"}`);

    // ── AUTO-APROBACIÓN ≥ 85% ───────────────────────────────────────────────
    if (similarity >= AUTO_APPROVE_THRESHOLD) {

      // 1. Actualizar userVerificationsTable → approved
      await db.update(userVerificationsTable)
        .set({
          status:     "approved",
          notes:      `KYC automático (Gemini): ${similarity}% similitud facial${documentNumber ? ` | Cédula: ${documentNumber}` : ""}`,
          reviewedAt: new Date(),
          updatedAt:  new Date(),
          // Limpiar URLs de imágenes en DB (privacidad)
          documentImageUrl: null,
          selfieImageUrl:   null,
        })
        .where(eq(userVerificationsTable.id, verificationId));

      // 2. Si es worker → marcar isVerified en workersTable
      if (userRole === "worker") {
        await db.update(workersTable)
          .set({
            isVerified:         true,
            verificationStatus: "approved",
            verificationNotes:  `KYC automático aprobado — ${similarity}% similitud`,
            documentImageUrl:   null,
            selfieImageUrl:     null,
          })
          .where(eq(workersTable.userId, userId));
      }

      // 3. Borrar archivos físicos del storage (best-effort)
      await Promise.allSettled([
        deleteStorageObject(documentImageUrl),
        deleteStorageObject(selfieImageUrl),
      ]);

      // 4. Notificar al usuario
      await createNotification(
        userId,
        "verification_approved",
        "✅ ¡Identidad verificada!",
        `Tu verificación fue aprobada automáticamente (${similarity}% de similitud). Ya tienes acceso completo a LinkServi.`,
      );

      console.log(`[KYC] ✅ Usuario ${userId} APROBADO (${similarity}%)`);

      return {
        outcome:        "approved",
        similarity,
        documentNumber,
        message:        `Aprobado automáticamente (${similarity}% similitud)`,
      };
    }

    // ── REVISIÓN MANUAL < 85% ───────────────────────────────────────────────
    await db.update(userVerificationsTable)
      .set({
        notes:     `KYC automático (Gemini): ${similarity}% similitud — requiere revisión manual${documentNumber ? ` | Cédula detectada: ${documentNumber}` : ""}`,
        updatedAt: new Date(),
      })
      .where(eq(userVerificationsTable.id, verificationId));

    await createNotification(
      userId,
      "verification_pending",
      "⏳ Verificación en revisión",
      "Tus documentos están siendo revisados manualmente. Te notificaremos pronto.",
    );

    console.log(`[KYC] ⏳ Usuario ${userId} → revisión manual (${similarity}%)`);

    return {
      outcome:        "manual_review",
      similarity,
      documentNumber,
      message:        `Score ${similarity}% — requiere revisión manual`,
    };

  } catch (err: any) {
    // Cualquier error de red/parsing → cola manual silenciosamente
    console.error(`[KYC] Error procesando usuario ${userId}:`, err?.message ?? err);

    return {
      outcome:        "error",
      similarity:     0,
      documentNumber: null,
      message:        err?.message ?? "Error de KYC — revisión manual asignada",
    };
  }
}
