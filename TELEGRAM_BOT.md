# Bot do Telegram: busca pelo chat

O bot é **público**: qualquer pessoa que encontrar o bot pode buscar lotes nos
leilões na hora (LeilõesBR, Receita Federal, Milton Sayegh e Sotheby's) e criar
os próprios alertas, recebendo os avisos no próprio chat. Para divulgar, basta
compartilhar o link `https://t.me/<username_do_bot>`.

Antes, configure o bot e o `TELEGRAM_CHAT_ID` seguindo o
[CONFIGURACAO.md](CONFIGURACAO.md), e publique o app no Vercel.

---

## Como usar

| Mensagem | O que acontece |
| --- | --- |
| `/buscar rolex submariner` | Busca e responde com os 5 primeiros lotes (foto, preço, fonte e link) |
| `rolex submariner` | O mesmo: qualquer texto sem `/` é tratado como busca |
| `/buscar omega até 30000` | Busca só lotes de até R$ 30.000 |
| `/alertas` | Lista os alertas da pessoa, com botões para pausar/ativar e excluir cada um |
| `/sobre` | Explica o que é o Watch Tracker, as fontes, como a busca filtra e como funcionam os alertas |
| `/informacoes` | Explica o tempo de resposta, o aviso "tempo esgotado", "nenhum lote encontrado" e outros erros |
| `/ajuda` ou `/start` | Mostra as instruções e a lista de comandos |

Quando uma busca termina com erro, com "tempo esgotado" ou sem resultados, a
resposta vem com a dica **ℹ️ Entenda os avisos: /informacoes**.

O preço máximo aceita `até 30000`, `ate 30.000`, `max 30k` ou `até 30 mil`, sempre
no fim da mensagem.

No fim de cada busca vêm dois botões:

- **🔔 Criar alerta:** transforma a busca (termo e preço máximo) em um alerta.
  Os lotes que já estão em leilão são registrados sem aviso; a partir daí a
  pessoa recebe só os novos, na rotina automática.
- **Abrir o app:** abre o Watch Tracker no navegador. Só aparece para você
  (`TELEGRAM_CHAT_ID`), já que o app não tem login.

Como na tela de busca do app, só entram lotes que parecem relógios.

### Tempo de resposta

A busca leva de alguns segundos a quase 1 minuto. O LeilõesBR é bem lento (o
site demora de 30 a 80 segundos para responder uma busca), e cada chamada no
Vercel tem no máximo 60 segundos. Por isso o bot espera cada fonte por até 48
segundos: se o LeilõesBR não responder a tempo, os resultados das outras
fontes chegam normalmente, com o aviso `⚠️ LeilõesBR: tempo esgotado`.

### Alertas de cada pessoa

- Cada alerta pertence ao chat que o criou: os avisos vão para aquele chat, e
  só aquela pessoa vê e gerencia o alerta em `/alertas`.
- **Os seus alertas** (do `TELEGRAM_CHAT_ID`) continuam sendo os mesmos da
  interface web: aparecem no app, recebem e-mail e não têm limite.
- Os alertas das outras pessoas **não aparecem na interface web** e não
  recebem e-mail (o `ALERT_EMAIL_TO` é o seu endereço).
- Limite de **5 alertas por pessoa**, porque cada alerta aumenta o tempo da
  rotina automática. Ajuste em `MAX_ALERTS_PER_USER`, em
  `server/src/telegram/bot.js`.
- Se alguém bloquear o bot, os alertas dessa pessoa são pausados
  automaticamente na próxima verificação.

### Limites e segurança

- Cada pessoa pode fazer **uma busca a cada 30 segundos** (`SEARCH_COOLDOWN_SECONDS`),
  para não sobrecarregar os sites dos leilões. Você não tem esse limite.
- O servidor só aceita chamadas que tragam o `TELEGRAM_WEBHOOK_SECRET`, então
  ninguém consegue se passar pelo Telegram.
- O bot guarda só o ID do chat e os alertas de cada pessoa (o `/sobre` avisa
  isso). Excluir um alerta apaga também o histórico dele.
- **Escala:** a rotina automática roda no GitHub Actions com até 8 minutos por
  rodada. Com muitos alertas, os que não couberem ficam para a rodada seguinte
  (são verificados primeiro). Se o bot crescer muito, vale diminuir o limite
  por pessoa ou o intervalo da rotina.

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
| `/setjoingroups` → **Disable** | Impede que adicionem o bot a grupos. Recomendado: em grupo, todos os membros dividiriam os mesmos alertas. |

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
| O bot não responde nada | Webhook não registrado (passo 3), ou o deploy com o `TELEGRAM_WEBHOOK_SECRET` ainda não terminou. |
| `Último erro: Wrong response from the webhook: 401` | O `TELEGRAM_WEBHOOK_SECRET` do `server/.env` é diferente do Vercel. Acerte e rode o passo 3 de novo. |
| `Último erro: ... 503` | `TELEGRAM_WEBHOOK_SECRET` ou `TELEGRAM_BOT_TOKEN` faltando no Vercel, ou faltou o redeploy. |
| `Último erro: ... 404` | URL do app errada no passo 3. |
| `⚠️ LeilõesBR: tempo esgotado` | O site demorou mais de 48 s. As outras fontes vêm normalmente; tente de novo mais tarde. |
| "Banco de dados não configurado" ao criar alerta | Falta `DATABASE_URL` no Vercel. |

Para ver o estado do webhook a qualquer momento, abra no navegador
`https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.
