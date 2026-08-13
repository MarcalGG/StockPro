import { PrismaClient } from "./generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Singleton do Prisma Client. Em desenvolvimento, o Next.js recarrega
// modulos a cada mudanca de arquivo (hot reload); sem esse cache global,
// cada reload criaria uma nova conexao com o banco, esgotando o limite de
// conexoes do SQLite/Postgres rapidamente.
//
// NOTA IMPORTANTE PARA PRODUCAO (Postgres): troque o adapter abaixo por
// PrismaPg (pacote "@prisma/adapter-pg"), conforme o comentario no final
// deste arquivo, ao migrar de SQLite para Postgres.

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL nao configurada. Defina em .env.local (dev) ou nas variaveis de ambiente do projeto (producao).",
    );
  }

  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// --- Para migrar de SQLite (dev) para Postgres (producao) ---
// 1. `npm install @prisma/adapter-pg pg`
// 2. Em prisma/schema.prisma, troque `provider = "sqlite"` por `provider = "postgresql"`.
// 3. Aqui, troque o import e a criacao do adapter para:
//
//    import { PrismaPg } from "@prisma/adapter-pg";
//    const adapter = new PrismaPg({ connectionString: databaseUrl });
//
// 4. Rode `npx prisma generate` e `npx prisma db push` (ou migrate deploy)
//    apontando DATABASE_URL para o Postgres de producao.
