# Bot do Telegram: busca pelo chat

Além de enviar os avisos dos alertas, o bot responde comandos: você manda o
que quer procurar e ele busca nos leilões na hora (LeilõesBR, Receita Federal,
Milton Sayegh e Sotheby's), sem abrir o app.

Antes, configure o bot e o `TELEGRAM_CHAT_ID` seguindo o
[CONFIGURACAO.md](CONFIGURACAO.md), e publique o app no Vercel.

---

## Como usar

| Mensagem | O que acontece |
| --- | --- |
| `/buscar rolex submariner` | Busca e responde com os 5 primeiros lotes (foto, preço, fonte e link) |
| `rolex submariner` | O mesmo: qualquer texto sem `/` é tratado como busca |
| `/buscar omega até 30000` | Busca só lotes de até R$ 30.000 |
| `/sobre` | Explica o que é o Watch Tracker, as fontes, como a busca filtra e como funcionam os alertas |
| `/informacoes` | Explica o tempo de resposta, o aviso "tempo esgotado", "nenhum lote encontrado" e outros erros |
| `/ajuda` ou `/start` | Mostra as instruções e a lista de comandos |

Quando uma busca termina com erro, com "tempo esgotado" ou sem resultados, a
resposta vem com a dica **ℹ️ Entenda os avisos: /informacoes**.

O preço máximo aceita `até 30000`, `ate 30.000`, `max 30k` ou `até 30 mil`, sempre
no fim da mensagem.

No fim de cada busca vêm dois botões:

- **🔔 Criar alerta:** transforma a busca (termo e preço máximo) em um alerta.
  Os lotes que já estão em leilão são registrados sem aviso; a partir daí você
  recebe só os novos, na rotina automática.
- **Abrir o app:** abre o Watch Tracker no navegador.

Como na tela de busca do app, só entram lotes que parecem relógios.

### Tempo de resposta

A busca leva de alguns segundos a quase 1 minuto. O LeilõesBR é bem lento (o
site demora de 30 a 80 segundos para responder uma busca), e cada chamada no
Vercel tem no máximo 60 segundos. Por isso o bot espera cada fonte por até 48
segundos: se o LeilõesBR não responder a tempo, os resultados das outras
fontes chegam normalmente, com o aviso `⚠️ LeilõesBR: tempo esgotado`.

### Segurança

O bot só responde ao chat do `TELEGRAM_CHAT_ID`. Mensagens de qualquer outra
pessoa que encontrar o bot são ignoradas, porque ele consegue criar alertas.
Além disso, o servidor só aceita chamadas que tragam o
`TELEGRAM_WEBHOOK_SECRET`, então ninguém consegue se passar pelo Telegram.

---

## Configuração

O Telegram precisa saber para onde mandar as mensagens do bot (o *webhook*).
Isso é feito uma vez, depois que o app está publicado.

### 1. Gerar o segredo do webhook

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarde o valor: ele vai no Vercel e no seu `server/.env`.

### 2. Cadastrar no Vercel

1. No projeto do Vercel, vá em **Settings → Environment Variables**.
2. Crie `TELEGRAM_WEBHOOK_SECRET` com o valor gerado.
3. Confira se `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `DATABASE_URL` também
   estão lá.
4. Em **Deployments**, clique nos **⋯** do último deploy e em **Redeploy**
   (variáveis novas só valem a partir do próximo deploy).

### 3. Registrar o webhook

No seu `server/.env`, coloque o mesmo segredo e o token do bot:

```
TELEGRAM_BOT_TOKEN=1234567890:AAH...
TELEGRAM_WEBHOOK_SECRET=o-mesmo-valor-do-vercel
```

Na raiz do projeto, rode (trocando pela URL do seu app):

```bash
npm run telegram:setup --workspace=server -- https://seu-app.vercel.app
```

A resposta esperada:

```
Webhook: https://seu-app.vercel.app/api/telegram/webhook
Sem erros registrados.
Pronto! Mande /ajuda para o bot.
```

O script também cadastra o menu de comandos (o botão `/` do chat) e o perfil
do bot: nome, descrição curta (página do bot e prévias de link) e descrição
(tela "O que este bot pode fazer?", antes da primeira mensagem). Os textos
ficam no começo de `server/src/telegram/setup.js`: para mudar, edite lá e rode
o script de novo.

### Ajustes pelo @BotFather

Algumas coisas a API não permite mudar; faça direto no
[@BotFather](https://t.me/BotFather):

| Comando | Para quê |
| --- | --- |
| `/setuserpic` | Foto de perfil do bot (imagem quadrada, de pelo menos 512×512). |
| `/setjoingroups` → **Disable** | Impede que adicionem o bot a grupos. Recomendado: ele só atende o seu chat. |

O **username** (`@..._bot`) não pode ser trocado depois de criado; para outro
username, é preciso criar um bot novo.

### 4. Testar

Mande `/ajuda` para o bot e depois uma busca, como `rolex`.

> Se trocar a URL do app ou o `TELEGRAM_WEBHOOK_SECRET`, rode o passo 3 de
> novo.

---

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| O bot não responde nada | Webhook não registrado (passo 3), ou mensagem enviada de outro chat que não o `TELEGRAM_CHAT_ID`. |
| `Último erro: Wrong response from the webhook: 401` | O `TELEGRAM_WEBHOOK_SECRET` do `server/.env` é diferente do Vercel. Acerte e rode o passo 3 de novo. |
| `Último erro: ... 503` | `TELEGRAM_WEBHOOK_SECRET` ou `TELEGRAM_BOT_TOKEN` faltando no Vercel, ou faltou o redeploy. |
| `Último erro: ... 404` | URL do app errada no passo 3. |
| `⚠️ LeilõesBR: tempo esgotado` | O site demorou mais de 48 s. As outras fontes vêm normalmente; tente de novo mais tarde. |
| "Banco de dados não configurado" ao criar alerta | Falta `DATABASE_URL` no Vercel. |

Para ver o estado do webhook a qualquer momento, abra no navegador
`https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.
