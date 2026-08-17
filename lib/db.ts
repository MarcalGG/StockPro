import { PrismaClient } from "./generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Singleton preguicoso do Prisma Client (ver getPrismaInstance/Proxy mais
// abaixo). Em desenvolvimento, o Next.js recarrega modulos a cada mudanca
// de arquivo (hot reload); sem o cache em globalThis, cada reload criaria
// uma nova conexao com o banco, esgotando o limite de conexoes do
// SQLite/Postgres rapidamente.
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

// Inicializacao preguicosa: o client real so e criado no primeiro uso
// efetivo (primeira propriedade acessada em "prisma"), nunca na avaliacao
// do modulo. Isso evita que importar este arquivo — direta ou
// transitivamente, ex. via lib/auth.ts em rotas que nunca tocam o banco,
// como /api/auth/logout — exija DATABASE_URL, e evita que o build do
// Next.js falhe na etapa de coleta de dados de pagina quando a variavel
// nao esta disponivel nesse momento. O cache em globalThis garante uma
// unica instancia por processo (sobrevive a hot reload em dev; em runtime
// normal so e criada uma vez, na primeira query real).
function getPrismaInstance(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  return globalThis.__prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const instance = getPrismaInstance();
    const value = Reflect.get(instance as object, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return Reflect.has(getPrismaInstance() as object, prop);
  },
});

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
