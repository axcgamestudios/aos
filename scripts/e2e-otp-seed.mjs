#!/usr/bin/env node
/* ============================================================
   E2E del happy path de /api/auth/verify-otp
   ------------------------------------------------------------
   Inserta un código REAL en la base de datos con el mismo
   formato que produce src/lib/auth-otp.ts (PBKDF2-SHA256, 60k
   iteraciones, sal aleatoria) y sent=true (como haría un
   proveedor de correo que acepta el envío). Luego el test
   llama al endpoint REAL /api/auth/verify-otp con ese código.
   Uso: node scripts/e2e-otp-seed.mjs [email]
   ============================================================ */
import { PrismaClient } from "@prisma/client";
import { randomBytes, pbkdf2Sync } from "node:crypto";

const email = (process.argv[2] ?? "e2e-axcsos@proton.me").toLowerCase();
const db = new PrismaClient();

const code = String(100000 + Math.floor(Math.random() * 900000));
const salt = randomBytes(12).toString("hex");
const codeHash = pbkdf2Sync(code, salt, 60_000, 32, "sha256").toString("hex");

await db.otpCode.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: new Date() } });
const row = await db.otpCode.create({
  data: {
    email,
    salt,
    codeHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    sent: true,
    ip: "seed-e2e",
  },
});
await db.$disconnect();
console.log(JSON.stringify({ email, code, id: row.id }));
