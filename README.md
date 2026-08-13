# StockScan Pro

App web para recebimento, conferencia e inventario de estoque.

## O que ja existe

O app abre em branco (sem nota, sem itens, sem contagem de estoque) — os dados de exemplo foram removidos. Tudo e preenchido pelo proprio usuario.

- Navegacao tipo app (barra inferior no celular, abas com icones no desktop), com interface responsiva.
- Dados da nota (numero, fornecedor, responsavel, data/hora de entrada) editaveis direto no card do cabecalho.
- Fluxo de foto da nota fiscal em papel (simulado).
- **Chave de acesso da NF-e sem esforco**: aceita a chave digitada ou colada com pontos, tracos ou espacos — o app limpa tudo automaticamente, formata em blocos de 4 digitos, valida os 44 numeros e extrai UF, emissao, CNPJ do emissor, modelo, serie e numero da nota. O botao "Usar chave e importar itens" preenche o numero da NF sozinho e ja leva para a conferencia.
- Cadastro manual de itens da nota (codigo, produto, unidade, quantidade) enquanto a importacao automatica nao esta conectada, com opcao de remover.
- **Conferencia com botoes rapidos por produto** (sem digitar numeros): Recebido tudo, Faltou, Sobrou, Avaria, Validade curta e Lote nao informado. O status e os destaques visuais (lote/validade) mudam sozinhos.
- **Resumo automatico de divergencias**: itens conferidos, pendentes, divergencias, produtos com falta, com sobra, com avaria, sem lote e com validade curta — tudo calculado em tempo real.
- **Mensagem pronta para WhatsApp**: gera um resumo com nota, fornecedor, responsavel e a lista de divergencias, com botao "Copiar mensagem" e link "Abrir no WhatsApp".
- **Recebimento salvo automaticamente no navegador** (localStorage): chave, itens, quantidades, lote, validade e observacoes sao restaurados se a pagina for recarregada. Botao "Limpar recebimento atual" para comecar do zero.
- Botao "Finalizar recebimento" (trava a conferencia e registra data/hora) com opcao de reabrir.
- Tela de inventario com cadastro manual de contagens (endereco, produto, quantidade, lotes, status).
- Relatorio de divergencia completo: dados da nota, responsavel, todos os itens (com lote/validade/avaria) e resumo para aprovacao. Tabelas viram cards no celular, sem cortar conteudo.
- Exportacao do relatorio: "Gerar PDF" abre a impressao do navegador (salvar como PDF) e "Exportar Excel" baixa um `.csv` com todos os itens.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra:

```text
http://localhost:3000
```

## Build

```bash
npm run build
```

## Publicar na Vercel

1. Suba este projeto para um repositorio GitHub.
2. Entre na Vercel.
3. Clique em **Add New > Project**.
4. Importe o repositorio `StockPro`.
5. Framework: **Next.js**.
6. Build command: `npm run build`.
7. Output directory: deixe em branco.
8. Clique em **Deploy**.

## Proximas fases

- OCR real para ler nota fiscal em papel.
- Leitura de codigo de barras pela camera.
- Consulta/importacao real do XML da NF-e (a estrutura de leitura da chave ja esta pronta).
- Banco de dados para historico de recebimentos.
- Login/autenticacao de usuarios.
- Exportacao em `.xlsx` nativo (hoje o export usa `.csv`, que o Excel abre normalmente) e em PDF com layout proprio (hoje usa a impressao do navegador).
