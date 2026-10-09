// Crea o asciende a un administrador (spec 0008, decisión 31). Los admins no se
// registran por la web: solo nacen aquí o en la semilla.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
// Opcionales: ADMIN_HANDLE (por defecto, lo que va antes de la @) y ADMIN_NAME.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const BCRYPT_COST = 12;
const MIN_PASSWORD = 12;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function handleFrom(email: string): string {
  const local = email.split('@')[0] ?? 'admin';
  const clean = local.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return clean.slice(0, 30) || 'admin';
}

async function main(): Promise<void> {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('ADMIN_PASSWORD');
  if (password.length < MIN_PASSWORD) {
    throw new Error(
      `ADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD} caracteres.`,
    );
  }
  const handle = process.env.ADMIN_HANDLE?.trim() || handleFrom(email);
  const displayName = process.env.ADMIN_NAME?.trim() || 'Administración Cafeta';
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DIRECT_URL') }),
  });
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        role: 'ADMIN',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        profile: { create: { handle, displayName } },
        notificationPreference: { create: {} },
      },
      update: { passwordHash, role: 'ADMIN' },
      select: { id: true, email: true, role: true },
    });
    console.log(`Admin listo: ${user.email} (${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
