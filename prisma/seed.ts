// Cria a empresa e o primeiro usuario administrador, se ainda nao existirem.
// Roda com: npm run db:seed
//
// Esta implementacao e de UMA empresa por instalacao (login simples de
// administrador, sem multiempresa) — por isso so existe uma linha em
// "Company". Os dados reais (razao social, CNPJ, ambiente) sao preenchidos
// depois, na tela Configuracoes > Documentos Fiscais, junto com o upload do
// certificado.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao configurada.");
  }
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log(
      "ADMIN_EMAIL / ADMIN_PASSWORD nao definidos em .env.local — nada para semear. " +
        "Defina essas variaveis e rode 'npm run db:seed' novamente.",
    );
    return;
  }

  let company = await prisma.company.findFirst();
  if (!company) {
    company = await prisma.company.create({
      data: {
        razaoSocial: "Minha Empresa (configure em Configuracoes > Documentos Fiscais)",
        cnpj: "00000000000000",
        ambiente: "HOMOLOGACAO",
      },
    });
    console.log("Empresa placeholder criada:", company.id);
  }

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`Usuario administrador ${adminEmail} ja existe — nada a fazer.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.adminUser.create({
    data: {
      email: adminEmail,
      passwordHash,
      companyId: company.id,
    },
  });

  console.log(`Usuario administrador criado: ${adminEmail}`);
  console.log("Troque a senha assim que possivel — esta e apenas a senha inicial de configuracao.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
