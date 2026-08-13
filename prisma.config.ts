// Segue a mesma convencao do Next.js: variaveis locais ficam em .env.local
// (nunca commitado). Em producao (Vercel), DATABASE_URL vem das variaveis
// de ambiente do projeto, entao este dotenv.config nao faz nada.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import { defineConfig, env } from "prisma/config";

// Configuracao do CLI do Prisma (migrate/generate). A connection string em
// si vem sempre de DATABASE_URL (variavel de ambiente) — nunca fica escrita
// aqui nem em nenhum arquivo commitado.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
