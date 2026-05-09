import { Router } from "express";
import { authenticate } from "../lib/auth";
import { logger } from "../lib/logger";
import { sendSupportContactEmail } from "../lib/email";

const router = Router();

const CATEGORIES = ["Pagos y reembolsos", "Cuenta y acceso", "Problemas técnicos", "Pedidos y entregas", "Premium y suscripciones", "Reportar un usuario", "Otro"];

router.post("/support/contact", authenticate, async (req, res): Promise<void> => {
  try {
    const { subject, message, category } = req.body;

    const toName  = req.user!.name;
    const toEmail = req.user!.email;
    const subj    = subject?.trim() || "Consulta general";
    const msg     = message?.trim();
    const cat     = CATEGORIES.includes(category) ? category : undefined;

    if (!msg) {
      res.status(400).json({ error: "Email y mensaje son requeridos" });
      return;
    }

    sendSupportContactEmail({ toEmail, toName, subject: subj, message: msg, category: cat }).catch((err) => {
      logger.warn({ err }, "Support email failed (non-critical)");
    });

    res.json({ ok: true, message: "Tu mensaje fue recibido. Te responderemos en máximo 24 h." });
  } catch (err) {
    logger.error({ err }, "Support contact failed");
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
});

export default router;
