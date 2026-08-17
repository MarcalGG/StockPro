import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit resolve seus arquivos de fonte (.afm) com path.join(__dirname, ...)
  // em tempo de execucao. Se o Turbopack empacota o modulo, __dirname aponta
  // para dentro do bundle e nao para node_modules/pdfkit — os .afm somem e a
  // geracao do PDF quebra (ENOENT). Mantendo-o fora do bundle (require nativo
  // do Node em tempo de execucao), os caminhos relativos do proprio pacote
  // continuam corretos.
  serverExternalPackages: ["pdfkit"],
  // Permite testar "npm run dev" a partir de outro dispositivo na mesma rede
  // Wi-Fi (ex.: celular acessando http://<ip-local>:PORTA). Sem isso, o
  // Next.js bloqueia os recursos de dev (HMR) vindos de uma origem diferente
  // de localhost, o que quebra a navegacao client-side apos acoes como
  // login. So afeta "next dev" — nao tem efeito em build/producao.
  allowedDevOrigins: ["192.168.31.189"],
};

export default nextConfig;
