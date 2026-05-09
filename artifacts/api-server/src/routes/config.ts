import { Router } from "express";

const router = Router();

router.get("/config/firebase", (_req, res): void => {
  const apiKey     = process.env.VITE_FIREBASE_API_KEY;
  const projectId  = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
  const appId      = process.env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !appId) {
    res.json({ configured: false });
    return;
  }

  // Always use the original firebaseapp.com domain for Google OAuth — never a
  // custom domain. Google validates the handshake against the project's own domain.
  const authDomain = `${projectId}.firebaseapp.com`;

  res.json({ configured: true, apiKey, authDomain, projectId, appId });
});

export default router;
