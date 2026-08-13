import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit resolve seus arquivos de fonte (.afm) com path.join(__dirname, ...)
  // em tempo de execucao. Se o Turbopack empacota o modulo, __dirname aponta
  // para dentro do bundle e nao para node_modules/pdfkit — os .afm somem e a
  // geracao do PDF quebra (ENOENT). Mantendo-o fora do bundle (require nativo
  // do Node em tempo de execucao), os caminhos relativos do proprio pacote
  // continuam corretos.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
