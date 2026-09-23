# Watch Tracker (MVP)

Acompanha palavras-chave (ex: "Rolex Submariner", "Omega Speedmaster") e mostra
os lotes de leilão encontrados em fontes brasileiras, destacando anúncios
novos desde a última busca.

- **Fontes de dados:**
  - [LeilõesBR](https://www.leiloesbr.com.br) — agregador que reúne o
    catálogo de vários leiloeiros brasileiros (Talloni Leilões, Leilões
    Vitória, Imperial JM Leilões, etc). Sem API oficial: o servidor faz
    scraping direto do HTML da busca (página renderizada no servidor, sem
    JavaScript/anti-bot no meio do caminho).
  - **Receita Federal** (Sistema Leilão Eletrônico) — API JSON pública e
    oficial, sem autenticação. O servidor lista os editais ainda abertos para
    propostas, olha só os lotes que a própria Receita classifica como
    "RELÓGIO/PARTE" (evita varrer milhares de lotes de outras categorias) e
    busca a descrição detalhada só desses. Resultado fica em cache 30 min no
    servidor, já que montar o índice varre vários endpoints.
  - [Milton Sayegh Leilões](https://www.miltonsayeghleiloes.com.br/) — leiloeiro
    de joias e relógios. O site não tem busca única: cada leilão em andamento
    tem seu próprio catálogo com um filtro por palavra-chave. O servidor
    descobre o(s) leilão(ões) abertos na página de agenda e busca o termo no
    catálogo de cada um.
  - [Sotheby's](https://www.sothebys.com/en/) — os dados vêm de um índice
    Algolia embutido no HTML da página de busca (`__NEXT_DATA__`), já com
    preço, estimativa, imagem e local do leilão. A busca já filtra só leilões
    futuros (`pfilters.dateRange=upcoming`). O site responde com uma cadeia de
    redirects 307 que setam um cookie esperado no próximo passo; o servidor
    segue esses redirects manualmente carregando o cookie adiante.
- **Filtro de fontes:** cada fonte tem um interruptor na barra lateral pra
  incluir/excluir da busca.
- **Busca manual sem banco:** palavras-chave e histórico de anúncios já
  vistos da tela de busca ficam no `localStorage` do navegador.
- **Alertas (robô):** a tela **Alertas** salva parâmetros no servidor
  (Postgres). Um agendador chama o servidor a cada 15 min, que roda a busca
  de cada alerta ativo e avisa por **e-mail** e **Telegram** quando aparece
  um lote que ainda não tinha sido visto. Ver [Alertas](#alertas).
- **Backend mínimo:** Node/Express. Cada fonte é um arquivo em
  `server/src/scrapers/`.

## Estrutura

```
client/                              React + Vite (interface)
server/
  src/app.js                         Rotas Express
  src/search.js                      Agrega os scrapers
  src/alerts/                        Alertas: banco (db), robô (checker), avisos (notify), rotas
shared/                              Código usado pelo cliente e pelo servidor (filtro de relógios, fontes)
.github/workflows/check-alerts.yml   Agendador: chama o robô a cada 15 min
  src/scrapers/leiloesbr.js          Scraper do LeilõesBR (cheerio)
  src/scrapers/receitaFederal.js     Cliente da API do Leilão Eletrônico da Receita Federal
  src/scrapers/miltonsayegh.js       Scraper do Milton Sayegh Leilões (cheerio)
  src/scrapers/sothebys.js           Cliente do índice Algolia embutido na busca da Sotheby's
```

## 1. Configurar o servidor

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

O servidor sobe em `http://localhost:4000`. Não precisa de nenhuma chave de
API — é só rodar.

## 2. Configurar o cliente

```bash
cd client
npm install
npm run dev
```

A interface sobe em `http://localhost:5173` e já tem um proxy configurado
(`/api` → `http://localhost:4000`), então não precisa configurar CORS nem URL
manualmente.

## 3. Rodar os dois juntos (opcional)

Na raiz do projeto:

```bash
npm install
npm run dev
```

## Alertas

A tela **Alertas** (menu lateral) cadastra parâmetros — termo de busca, faixa
de preço, fontes, "somente relógios", palavras obrigatórias e proibidas no
título — e o robô avisa quando um lote novo que bate com eles aparece.

**Como o robô decide o que é "novo":** os sites não informam quando um lote
foi cadastrado, então vale a data em que o robô viu o lote pela primeira vez
(precisão = intervalo do agendador, 15 min). Ao criar um alerta, tudo o que
já está em leilão é registrado sem aviso; depois disso só chega aviso do que
aparecer. Todos os lotes retornados ficam guardados (não só os que batem com
os filtros), então afrouxar um filtro depois não reenvia lote antigo. Mudar o
termo de busca reinicia o histórico do alerta.

### Configuração

Todas as variáveis estão em `server/.env.example`. No Vercel, cadastre-as em
*Settings → Environment Variables*.

1. **Banco:** crie um Postgres gratuito (ex: [Neon](https://neon.tech)) e
   defina `DATABASE_URL`. As tabelas são criadas sozinhas.
2. **E-mail:** crie uma conta no [Resend](https://resend.com), gere uma API
   key e defina `RESEND_API_KEY` e `ALERT_EMAIL_TO`. Sem domínio verificado,
   o remetente `onboarding@resend.dev` só envia para o e-mail da própria
   conta Resend; para outros destinatários, verifique um domínio e ajuste
   `ALERT_EMAIL_FROM`.
3. **Telegram:** fale com o [@BotFather](https://t.me/BotFather), crie um bot
   (`/newbot`) e copie o token para `TELEGRAM_BOT_TOKEN`. Mande qualquer
   mensagem para o bot e abra
   `https://api.telegram.org/bot<TOKEN>/getUpdates` — o `chat.id` que
   aparece vai em `TELEGRAM_CHAT_ID` (para um grupo, adicione o bot ao grupo;
   o id começa com `-`).
4. **Agendador:** defina `CRON_SECRET` (valor longo e aleatório) no Vercel.
   No GitHub, em *Settings → Secrets and variables → Actions*, crie os
   secrets `APP_URL` (ex: `https://seu-app.vercel.app`) e `CRON_SECRET`
   (mesmo valor). O workflow `check-alerts.yml` passa a chamar
   `POST /api/cron/check-alerts` a cada 15 min — dá pra disparar na mão em
   *Actions → Check alerts → Run workflow*. O `vercel.json` também registra um
   cron diário do Vercel como rede de segurança.
5. Na tela **Alertas**, use **Enviar teste** para confirmar e-mail e Telegram.

**Rodando localmente:** com `DATABASE_URL` no `server/.env`, defina
`ALERTS_INTERVAL_MINUTES=15` para o próprio servidor verificar os alertas
sem precisar do GitHub Actions. O botão **Verificar agora** de cada alerta
também roda na hora (e envia os avisos).

**Limites:** cada execução no Vercel tem até 60 s; o robô para de iniciar
alertas novos perto de 40 s e os que ficaram para trás são os primeiros da
próxima rodada. O GitHub pode atrasar execuções agendadas em alguns minutos
e desativa o agendamento depois de 60 dias sem commits no repositório (basta
reativar em *Actions*). No Telegram, cada rodada manda no máximo 10 lotes por
alerta com foto; o restante vai resumido (o e-mail lista todos).

## Como usar

1. Digite uma palavra-chave (ex: "Rolex", "Citizen", "Mondaine") e clique em
   **Adicionar**.
2. A busca roda nas fontes habilitadas e mostra os lotes encontrados: título,
   lance mínimo/preço, data/UF ou prazo de propostas, e o leiloeiro/órgão
   responsável. Cada fonte aparece com seu total (ou erro) no topo.
3. Clicar numa palavra-chave já cadastrada busca de novo na hora — não tem
   botão de atualizar separado.
4. Marque **Atualizar automaticamente** para repetir a busca de todas as
   palavras-chave a cada 10 minutos.
5. Anúncios que apareceram desde a última busca ganham uma etiqueta **Novo**.
6. Clicar num card leva para a página do lote/edital na fonte original.
7. Na seção **Fontes**, desligue o interruptor de qualquer fonte pra excluí-la
   das buscas (e do que aparece na tela) sem precisar removê-la.

## Limitações do MVP / próximos passos

- A busca no LeilõesBR é a busca nativa do site (texto livre) — ele decide o
  que "bate" com a palavra-chave, então pode trazer itens não relacionados
  (ex: colecionismo, réplicas) junto com relógios de verdade.
- A busca na Receita Federal só olha lotes já classificados como
  "RELÓGIO/PARTE" pelo próprio sistema — um relógio classificado em outra
  categoria (ex: junto com joias) não aparece. Sem fotos disponíveis nessa
  fonte (a API não expõe imagens).
- A primeira busca na Receita Federal depois do servidor subir (ou depois de
  30 min) demora um pouco mais, porque o servidor precisa montar o índice
  varrendo os editais abertos antes de filtrar pela palavra-chave.
- A busca no Milton Sayegh Leilões só encontra lotes nos leilões que estão
  com catálogo aberto no momento (o site não tem busca única em todo o
  histórico); se não houver nenhum leilão em andamento, essa fonte não
  retorna nada.
- **Superbid não foi integrado:** o site fica atrás de um desafio JS do
  Cloudflare ("Just a moment...") em todas as páginas, igual ao que já tinha
  bloqueado o OLX — não dá pra contornar com scraping simples de HTML.
- **Phillips e Christie's também não foram integrados:** os dois usam
  formatos de dados incorporados no HTML que não são JSON simples (diferente
  da Sotheby's). O Phillips (`phillips.com/watches`) usa o formato
  "turbo-stream" do React Router/Remix — a busca em si é só client-side (a
  URL com `?q=` não filtra nada no servidor) e o payload embutido é uma árvore
  de referências que não decodifica direto pra um objeto usável. O Christie's
  tem duas partes distintas: a página do departamento
  (`christies.com/en/departments/...`) usa Next.js com JSON simples mas não
  tem lotes, só editorial; a busca de fato (`christies.com/en/results?query=`)
  é outro app Next.js que usa o formato de streaming RSC (também não é JSON
  simples) e ainda carrega um script de desafio do AWS WAF na página.
- Outros leiloeiros/agregadores (Sodré Santoro etc.) podem ter proteção
  anti-bot ou estrutura diferente — cada um precisaria do próprio scraper em
  `server/src/scrapers/`.
- **Mercado Livre, OLX e Craigslist não foram integrados:** a API pública de
  busca do Mercado Livre agora exige autenticação OAuth (não dá pra fazer
  scraping nem chamar a API sem registrar um app em
  developers.mercadolivre.com.br); o OLX foi tentado (scraper de
  `olx.com.br/brasil?q=...`) mas removido — fica atrás de proteção anti-bot
  (Cloudflare) que bloqueia a maioria das requisições do servidor, então
  na prática a busca falhava quase sempre; o Craigslist não tem cobertura
  real no Brasil (não existe site local de São Paulo/outras cidades), então
  não haveria resultado relevante pra esse caso de uso.
- Na tela de busca manual, se limpar o localStorage do navegador, o
  histórico de "anúncios já vistos" e a lista de palavras-chave se perdem
  (os alertas ficam no banco e não são afetados).
- Os alertas não têm login: qualquer pessoa com a URL do app consegue ver e
  editar alertas (os avisos, porém, só vão para os destinatários definidos
  nas variáveis de ambiente).
- O robô olha até 60 resultados por fonte em cada alerta; um termo muito
  genérico pode ter lotes novos além disso que não são percebidos — prefira
  termos específicos (ex: "Rolex Submariner" em vez de "relógio").
- Scraping de HTML é frágil: se o LeilõesBR mudar o layout da página de
  busca, o scraper em `leiloesbr.js` para de encontrar os itens e precisa
  ser ajustado.
