import crypto from "node:crypto";

// Criptografia simetrica (AES-256-GCM) usada para guardar o PEM do
// certificado A1 e da chave privada no banco. A chave vem SOMENTE de
// CERT_ENCRYPTION_KEY (variavel de ambiente) — nunca fica no codigo, no
// banco junto com o dado criptografado, nem em log nenhum.
//
// Formato armazenado: "<iv base64>:<authTag base64>:<ciphertext base64>"

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM

function getEncryptionKey(): Buffer {
  const hex = process.env.CERT_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "CERT_ENCRYPTION_KEY nao configurada. Gere uma com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "CERT_ENCRYPTION_KEY invalida: precisa ter exatamente 64 caracteres hexadecimais (32 bytes).",
    );
  }
  return key;
}

export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(stored: string): string {
  const key = getEncryptionKey();
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Valor criptografado em formato invalido.");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
