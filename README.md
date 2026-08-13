# StockScan Pro

App web para recebimento, conferencia e inventario de estoque.

## O que ja existe

- Navegacao tipo app (barra inferior no celular, abas com icones no desktop), com interface responsiva.
- Fluxo de foto da nota fiscal em papel (simulado).
- Fluxo de chave de acesso da NF-e: aceita chave digitada, colada (Ctrl+V ou botao "Colar") ou escaneada, com formatacao automatica em blocos de 4 digitos, validacao dos 44 digitos e extracao de UF, emissao, CNPJ do emissor, modelo, serie e numero da nota.
- Conferencia de quantidade esperada x recebida, com edicao de lote e validade por item.
- Marcacao de avaria por item, com observacao da avaria.
- Status automatico por item: conferido, divergente ou pendente.
- Resumo automatico de divergencias (unidades em falta, em sobra, itens com avaria, itens sem lote/validade) e campo de observacoes gerais do recebimento.
- Botao "Finalizar recebimento" (trava a conferencia e registra data/hora) com opcao de reabrir.
- Tela de inventario.
- Relatorio de divergencia completo: dados da nota, responsavel, todos os itens (com lote/validade/avaria) e resumo para aprovacao.
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
