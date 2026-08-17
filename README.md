# StockScan Pro

App web para recebimento, conferencia e inventario de estoque.

## O que ja existe

O app abre em branco (sem nota, sem itens, sem contagem de estoque) — os dados de exemplo foram removidos. Tudo e preenchido pelo proprio usuario.

- Navegacao tipo app (barra inferior no celular, abas com icones no desktop), com interface responsiva.
- Dados da nota (numero, fornecedor, responsavel, data/hora de entrada) editaveis direto no card do cabecalho.
- **Foto da nota pela camera de verdade**: o botao "Tirar foto da nota" abre a camera real do aparelho (via `capture="environment"`) e guarda a foto como evidencia do recebimento.
- **Importar XML da NF-e (o jeito mais rapido de tudo)**: escolha o arquivo `.xml` da nota (o mesmo que o fornecedor manda por e-mail ou que da pra baixar do portal dele) e o app le tudo sozinho, 100% no navegador — nada e enviado para servidor nenhum. Preenche automaticamente numero da NF, fornecedor, CNPJ, chave de acesso e **todos os itens com codigo, descricao, unidade e quantidade**; quando o fornecedor preenche a rastreabilidade no XML (tag `<rastro>`), **lote e validade tambem vem prontos**. Mostra uma previa antes de confirmar a importacao.
- **Chave de acesso da NF-e sem esforco**: um botao "Escanear codigo de barras / QR com a camera" le a chave direto da DANFE usando a camera (API nativa `BarcodeDetector` do navegador, sem servico externo) — funciona em Chrome/Edge no Android e desktop; onde nao ha suporte, o app avisa e cai automaticamente para colar/digitar. Aceita a chave com pontos, tracos ou espacos, limpa tudo, formata em blocos de 4 digitos e valida os 44 numeros **com o digito verificador real da NF-e (modulo 11)** — uma chave aleatoria com 44 digitos, mas com o digito verificador errado, e rejeitada com "chave incorreta". Extrai UF, emissao, CNPJ do emissor, modelo, serie e numero da nota. Importante: a chave sozinha **nao** traz os produtos (isso exigiria consulta paga ao SEFAZ com certificado digital da empresa) — para trazer os itens automaticamente, use a importacao de XML acima.
- Cadastro manual de itens da nota (codigo, produto, unidade, quantidade) para quando nao houver XML, com opcao de remover. O campo de codigo tem um botao de camera para ler o codigo de barras do produto sem digitar.
- **Escanear produtos na conferencia fisica**: botao "Escanear produtos (camera)" abre um modo continuo — aponta para o codigo de barras (EAN) de cada produto e o app soma 1 na quantidade recebida sozinho, mostrando "+1 Nome do produto" na hora. Pode escanear varias unidades/produtos seguidos sem fechar a camera; um pequeno intervalo evita contar duas vezes o mesmo codigo parado na frente da lente. Se o codigo nao bate com nenhum item da nota, avisa "nao encontrado" em vez de contar errado. Funciona tanto com o `cEAN` vindo do XML quanto com o codigo digitado manualmente.
- **Conferencia com botoes rapidos por produto** (sem digitar numeros): Recebido tudo, Faltou, Sobrou, Avaria, Validade curta e Lote nao informado. O status e os destaques visuais (lote/validade) mudam sozinhos.
- **Resumo automatico de divergencias**: itens conferidos, pendentes, divergencias, produtos com falta, com sobra, com avaria, sem lote e com validade curta — tudo calculado em tempo real.
- **Mensagem pronta para WhatsApp**: gera um resumo com nota, fornecedor, responsavel e a lista de divergencias, com botao "Copiar mensagem" e link "Abrir no WhatsApp".
- **Recebimento salvo automaticamente no navegador** (localStorage): chave, itens, quantidades, lote, validade e observacoes sao restaurados se a pagina for recarregada. Botao "Limpar recebimento atual" para comecar do zero.
- Botao "Finalizar recebimento" (trava a conferencia e registra data/hora) com opcao de reabrir.
- Tela de inventario com cadastro manual de contagens (endereco, produto, quantidade, lotes, status).
- Relatorio de divergencia completo: dados da nota, responsavel, todos os itens (com lote/validade/avaria) e resumo para aprovacao. Tabelas viram cards no celular, sem cortar conteudo.
- Exportacao do relatorio: "Gerar PDF" abre a impressao do navegador (salvar como PDF) e "Exportar Excel" baixa um `.csv` com todos os itens.
- **Configuracoes > Documentos Fiscais** (login administrativo): configure o certificado digital A1 da empresa e o app sincroniza automaticamente NF-e e CT-e destinadas ao CNPJ, direto da SEFAZ. Ver secao dedicada abaixo.
- **Remessas para Contabilidade** (login administrativo): selecione NF-e/CT-e sincronizados e ja prontos, monte uma remessa organizada, baixe um pacote `.zip` com os XMLs/PDFs e um resumo em PDF, prepare a mensagem de WhatsApp e o e-mail (sem enviar automaticamente) e acompanhe tudo num historico com status. Ver secao dedicada abaixo.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
# edite .env.local: gere CERT_ENCRYPTION_KEY e SESSION_SECRET (comando no
# proprio arquivo), e defina ADMIN_EMAIL / ADMIN_PASSWORD para o primeiro login
npm run db:push
npm run db:seed
npm run dev
```

Abra:

```text
http://localhost:3000
```

Login administrativo (Configuracoes > Documentos Fiscais): `http://localhost:3000/login`, com o e-mail/senha que voce definiu em `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

### Desenvolvimento local no Windows

Passo a passo completo para rodar o projeto do zero numa máquina Windows (testado com PowerShell/Git Bash):

1. **Node**: use a versão recomendada no `package.json` (`engines.node >= 18.18.0`). Confirme com `node -v`.
2. **`.env.local`**: nunca crie do zero — copie o exemplo e edite só os valores locais:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   Gere `CERT_ENCRYPTION_KEY` e `SESSION_SECRET` com o comando indicado dentro do próprio `.env.example`, e defina `ADMIN_EMAIL`/`ADMIN_PASSWORD` só para o primeiro login local. **Nunca reutilize credenciais, connection string ou segredos de produção/Vercel num `.env.local`** — gere valores novos, exclusivos para a máquina de desenvolvimento.
3. **Binário nativo do SQLite**: se `npm run db:seed` ou qualquer rota que usa banco falhar com `Could not locate the bindings file` (binário `.node` do `better-sqlite3` ausente ou compilado para outra versão/plataforma do Node), reconstrua só o módulo nativo — não precisa reinstalar tudo:
   ```powershell
   npm rebuild better-sqlite3 --foreground-scripts
   ```
4. **Prisma Client**: gerado automaticamente pelo `postinstall` do `npm install`; se precisar regenerar manualmente (ex. depois de mudar `schema.prisma`):
   ```powershell
   npx prisma generate
   ```
5. **Banco local**: o projeto não tem migrations oficiais (só `schema.prisma`), então a sincronização do schema é via:
   ```powershell
   npm run db:push
   ```
6. **Seed**: cria a empresa placeholder e o primeiro admin, usando `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env.local`:
   ```powershell
   npm run db:seed
   ```
7. **Servidor**:
   ```powershell
   npm run dev
   ```
8. **Confirme que nada sensível será versionado** antes de commitar:
   ```powershell
   git check-ignore -v .env.local
   git check-ignore -v prisma/dev.db
   ```
   Ambos devem aparecer como ignorados (`.gitignore` já cobre `.env*` e `/prisma/*.db`) — se algum comando não retornar nada, pare e não commite.

## Build

```bash
npm run build
```

## Publicar na Vercel

O app agora tem duas partes: o front-end (sempre funcionou 100% no navegador) e o back-end fiscal novo (certificado A1, login, banco de dados). O front-end continua funcionando normalmente mesmo se voce nao configurar a parte fiscal ainda.

1. Suba este projeto para um repositorio GitHub.
2. **Crie um banco Postgres** (Vercel Postgres ou [Neon](https://neon.tech), ambos tem plano gratuito). SQLite (usado em desenvolvimento local) nao funciona na Vercel — funcoes serverless nao tem disco persistente.
3. Em `prisma/schema.prisma`, troque `provider = "sqlite"` por `provider = "postgresql"`.
4. Em `lib/db.ts`, troque o adapter SQLite pelo adapter Postgres (`@prisma/adapter-pg`) — o proprio arquivo tem um comentario com o codigo exato para essa troca.
5. `npm install @prisma/adapter-pg pg`.
6. Entre na Vercel, **Add New > Project**, importe o repositorio.
7. Configure as variaveis de ambiente do projeto na Vercel: `DATABASE_URL` (connection string do Postgres), `CERT_ENCRYPTION_KEY`, `SESSION_SECRET` (gere as duas com o comando no `.env.example`). `ADMIN_EMAIL`/`ADMIN_PASSWORD` sao opcionais aqui — so servem para o script de seed.
8. Framework: **Next.js**. Build command: `npm run build`. Output directory: deixe em branco. Clique em **Deploy**.
9. Depois do primeiro deploy, rode o seed **contra o banco de producao** (uma vez so, da sua maquina): `DATABASE_URL="<a mesma da Vercel>" ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed`. Isso cria a empresa e o primeiro usuario administrador.
10. Acesse `https://seu-site.vercel.app/login` com esse e-mail/senha para configurar o certificado.

## Certificado Digital A1 e sincronizacao de NF-e/CT-e

Como funciona, tecnicamente:

- O certificado (.pfx/.p12) e enviado uma unica vez pela tela **Configuracoes > Documentos Fiscais**. O backend le o certificado, extrai o certificado e a chave privada, **criptografa os dois com AES-256-GCM** (chave em `CERT_ENCRYPTION_KEY`) e grava no banco. A senha original do certificado e usada so nesse momento, em memoria, e nunca e salva em lugar nenhum — nem no banco, nem em log, nem na resposta da API.
- A consulta usa o servico oficial de **Distribuicao de DF-e** da SEFAZ (`NFeDistribuicaoDFe` para NF-e, `CTeDistribuicaoDFe` para CT-e), autenticando com o certificado via TLS mutuo — o mesmo mecanismo que ERPs comerciais usam. Nao ha scraping nem consulta publica.
- Cada sincronizacao usa o `ultNSU` (numero sequencial) da ultima busca, para nao reprocessar os mesmos documentos, e tem um intervalo minimo entre buscas para nao sobrecarregar o servico da SEFAZ.
- Documentos sao gravados sem duplicar (chave de acesso e unica por empresa).
- Todas as rotas fiscais exigem login administrativo (`lib/auth.ts`, sessao em cookie assinado). Sem sessao, a tela de Recebimento continua funcionando normalmente — a consulta de chave so deixa de mostrar o vinculo automatico.
- Esta implementacao e de **uma empresa por instalacao** (login simples de administrador, sem multiempresa) — o isolamento por CNPJ e garantido porque so existe uma empresa no banco.

Limitacoes reais (nao testadas contra o servico real da SEFAZ, por nao haver como validar isso neste ambiente):

- Os endpoints/parametros da SEFAZ foram implementados a partir de documentacao publica e podem precisar de ajuste fino contra o manual oficial vigente antes de operar em producao.
- O teste de conexao e a sincronizacao real dependem de um certificado A1 valido e de rede liberada ate a SEFAZ — teste isso na sua maquina/servidor antes de confiar na integracao.

## Remessas para Contabilidade (envio em lote de NF-e/CT-e)

Fica em **Documentos > Remessas para Contabilidade** (`/documentos`), atras do mesmo login administrativo da tela de certificado. Como funciona:

- **Documentos prontos para envio**: lista todo NF-e/CT-e ja sincronizado da SEFAZ que ainda nao entrou em nenhuma remessa. Selecao multipla (checkbox, "selecionar todos visiveis", "limpar selecao") com um resumo dinamico (total, NF-e, CT-e, periodo, arquivos disponiveis, documentos sem XML/sem PDF).
- **Revisar remessa**: antes de salvar, mostra nome gerado automaticamente, periodo, responsavel, data/hora, observacao opcional e a lista de conferencia completa (com opcao de remover qualquer documento antes de confirmar). Dai da pra **salvar como rascunho** ou **confirmar a remessa**.
- Assim que um documento entra numa remessa (rascunho ou confirmada), ele sai da lista de "prontos para envio" e nao pode entrar em outra remessa ativa ao mesmo tempo — a garantia e reforcada no banco (transacao que so vincula documentos que ainda estejam livres).
- **Pacote .zip**: gera `Remessa_Contabilidade_AAAA-MM-DD/` com pastas `NFE/` e `CTE/` contendo os XMLs e PDFs disponiveis de cada documento, mais um `resumo-remessa.pdf` (nome, periodo, responsavel, lista de documentos e chaves de acesso — nunca fotos, conferencia fisica, divergencias ou inventario, que nem existem neste banco). Se algum documento nao tiver nenhum arquivo (nem XML nem PDF), a geracao e bloqueada e a tela explica qual documento esta incompleto.
- **PDF do DANFE/DACTE**: o servico de Distribuicao de DF-e da SEFAZ so devolve XML — nao existe PDF nesse fluxo. Por isso o PDF de cada documento e um anexo manual opcional (botao "Anexar PDF" na lista de disponiveis).
- **WhatsApp**: botao "Preparar mensagem para WhatsApp" monta o texto (segue o modelo com periodo/total/NF-e/CT-e/nome da remessa) e so abre o WhatsApp (`wa.me`) se voce informar um numero — nunca envia sozinho.
- **E-mail**: botao "Preparar e-mail" monta assunto, corpo e lista de documentos, com um link `mailto:` para abrir no seu aplicativo de e-mail. Deixa claro que o envio automatico ainda nao esta integrado e que o pacote `.zip` precisa ser anexado manualmente (link `mailto:` nao anexa arquivo).
- **Historico de remessas**: rascunho, pronta para envio, enviada, enviada com pendencias (quando algum documento da remessa nao tinha XML no momento do envio) ou cancelada. "Marcar remessa como enviada" pede confirmacao explicita antes de registrar data/hora/responsavel e trava a remessa. "Cancelar remessa" exige motivo, nunca apaga documentos e devolve os documentos (ainda nao enviados) para a lista de disponiveis.
- Toda acao fica no mesmo historico de auditoria da tela de certificado (`remessa.criada_rascunho`, `remessa.confirmada`, `remessa.cancelada`, `remessa.marcada_enviada`, `documento.pdf_anexado`, etc.).

Limitacoes reais desta funcionalidade:

- Envio por WhatsApp e e-mail e sempre **preparado, nunca automatico** — por decisao explicita do escopo, nao existe (e nao deve existir) um botao que dispare o envio sozinho.
- A integracao de envio de e-mail por um provedor (SMTP, SendGrid etc.) nao existe ainda — o botao so monta o conteudo e abre o `mailto:` do seu sistema operacional.
- PDF do DANFE/DACTE nunca vem automatico da SEFAZ — precisa ser anexado a mao por documento, senao a remessa/pacote fica sem PDF (o XML sozinho ja e aceito, so o `.zip` bloqueia se faltarem os dois arquivos).

## Sobre a leitura por camera

O scanner de codigo de barras/QR usa a API nativa `BarcodeDetector` do navegador — funciona sem instalar nada, mas hoje so tem suporte real em Chrome/Edge (Android e desktop). Em navegadores sem suporte (Safari/iOS, por exemplo) o app mostra um aviso e o usuario cola ou digita a chave normalmente. A camera so e acessada quando o usuario clica em escanear, e pede a permissao do navegador na hora.
