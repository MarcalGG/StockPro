// Inicializacao do Firebase Authentication (SDK client-side).
//
// Segue o mesmo padrao do projeto Ascend (src/core/firebase.ts): a config e
// montada so a partir de variaveis de ambiente publicas (NEXT_PUBLIC_*, vao
// para o bundle do navegador por natureza — nao sao segredo; a protecao real
// vem dos dominios autorizados configurados no console do Firebase, nao do
// valor em si). Este projeto usa um Firebase PROPRIO do StockPro — nunca
// reutilize a config do Ascend nem de nenhum outro projeto.
//
// Quando as variaveis nao estao definidas, inicializamos com um placeholder
// sintaticamente valido em vez de pular a inicializacao: `getAuth()` valida a
// forma da config no import e lancaria um erro que derrubaria a aplicacao
// inteira (nao so o login) em qualquer build/ambiente sem essas variaveis.
// O flag `firebaseConfigured` e o que o resto do app consulta para decidir
// se mostra a tela de login funcional ou o aviso de "nao configurado".

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const placeholderConfig: FirebaseOptions = {
  apiKey: "placeholder-api-key",
  authDomain: "placeholder.firebaseapp.com",
  projectId: "placeholder-project",
  appId: "1:000000000000:web:0000000000000000000000",
};

const app = getApps()[0] ?? initializeApp(firebaseConfigured ? firebaseConfig : placeholderConfig);

let auth: Auth | null = null;
try {
  auth = getAuth(app);
} catch (error) {
  console.error("[firebase] falha ao inicializar Auth:", error);
  auth = null;
}

export { auth };
