import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { authenticate } from "../lib/auth";
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const router = Router();

function generateCode(name: string, id: number): string {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
  let suffix = "";
  let n = id + Date.now();
  for (let i = 0; i < 4; i++) {
    suffix += CHARS[n % CHARS.length];
    n = Math.floor(n / CHARS.length) + Math.floor(Math.random() * 100);
  }
  return `${base}${suffix}`;
}

router.get("/referral/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let referralCode = user.referralCode;
  if (!referralCode) {
    referralCode = generateCode(user.name, user.id);
    await db.update(usersTable).set({ referralCode }).where(eq(usersTable.id, user.id));
  }

  const appUrl = process.env.APP_URL ?? "https://linkservi.com";

  res.json({
    referralCode,
    referralBonus: user.referralBonus ?? 0,
    referralCount: user.referralCount ?? 0,
    referralUrl: `${appUrl}/register?ref=${referralCode}`,
  });
});

router.post("/referral/use", authenticate, async (req, res): Promise<void> => {
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: "Código de referido requerido" }); return; }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  if (me.referredBy) { res.status(400).json({ error: "Ya usaste un código de referido anteriormente" }); return; }

  const [referrer] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.referralCode, code.toUpperCase()), ne(usersTable.id, req.user!.id)));

  if (!referrer) { res.status(404).json({ error: "Código de referido inválido" }); return; }

  await db.update(usersTable)
    .set({ referredBy: code.toUpperCase(), referralBonus: (me.referralBonus ?? 0) + 2 })
    .where(eq(usersTable.id, req.user!.id));

  await db.update(usersTable)
    .set({
      referralCount: (referrer.referralCount ?? 0) + 1,
      referralBonus: (referrer.referralBonus ?? 0) + 5,
    })
    .where(eq(usersTable.id, referrer.id));

  res.json({ success: true, bonusEarned: 2, referrerName: referrer.name });
});

export default router;
