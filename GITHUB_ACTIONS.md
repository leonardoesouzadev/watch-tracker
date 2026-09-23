# Robô de alertas no GitHub Actions

O GitHub Actions roda a verificação dos alertas a cada **2 horas, todos os
dias**, direto nos servidores do GitHub. Ele não depende do Vercel nem do seu
computador ligado: conecta no banco (Supabase), busca os lotes novos e envia os
avisos pelo Telegram e por e-mail.

- Workflow: `.github/workflows/check-alerts.yml`
- Script que ele executa: `server/src/check-alerts.js` (`npm run check-alerts --workspace=server`)

Antes, configure o Supabase e o Telegram seguindo o
[CONFIGURACAO.md](CONFIGURACAO.md).

---

## 1. Cadastrar os secrets no GitHub

O runner do GitHub não lê o seu `server/.env`. As mesmas variáveis precisam
ser cadastradas como **secrets** do repositório, que ficam criptografados e
não aparecem nos logs.

1. Abra o repositório no GitHub.
2. Vá em **Settings → Secrets and variables → Actions**.
3. Na aba **Secrets**, clique em **New repository secret** para cada item:

| Secret | Obrigatório | Valor |
| --- | --- | --- |
| `DATABASE_URL` | Sim | A mesma connection string do Supabase (Transaction pooler, porta 6543) |
| `TELEGRAM_BOT_TOKEN` | Para avisos no Telegram | Token do bot |
| `TELEGRAM_CHAT_ID` | Para avisos no Telegram | Seu Chat ID |
| `RESEND_API_KEY` | Para avisos por e-mail | API key do Resend |
| `ALERT_EMAIL_TO` | Para avisos por e-mail | E-mail(s) de destino, separados por vírgula |
| `ALERT_EMAIL_FROM` | Não | Remetente; se ficar sem, usa `Watch Tracker <onboarding@resend.dev>` |

Copie os valores do seu `server/.env`, **sem aspas e sem espaços** no começo
ou no fim.

> **Use a string do Transaction pooler no `DATABASE_URL`.** A "Direct
> connection" do Supabase só funciona em IPv6, e os runners do GitHub usam
> IPv4: a conexão falharia.

## 2. Rodar pela primeira vez (manualmente)

Não precisa esperar as 2 horas para saber se está tudo certo:

1. Abra a aba **Actions** do repositório.
2. Na lista da esquerda, clique em **Check alerts**.
3. Clique em **Run workflow → Run workflow**.
4. Aguarde a execução (uns 30 a 60 segundos) e abra-a.
5. No passo **Check alerts** deve aparecer algo como:

   ```
   [alerts] 2 checked, 0 skipped, 0 new, 5321ms
     alerta 1: 0 novo(s)
     alerta 2: 0 novo(s)
   ```

Se nenhum alerta estiver cadastrado, aparece `0 checked`. Isso já confirma que
a conexão com o banco funcionou.

> **Lembre-se:** na primeira verificação de cada alerta, tudo o que já está em
> leilão é registrado sem aviso. Só chegam avisos de lotes que aparecerem
> depois disso.

## 3. Como funciona o agendamento

- **Frequência:** `0 */2 * * *`, ou seja, a cada 2 horas, todos os dias, nas
  horas pares em UTC (em Brasília: 1h, 3h, 5h, ..., 23h).
- **Uma execução por vez:** se uma rodada demorar, a próxima espera em vez de
  verificar os mesmos alertas em paralelo.
- **Limite por rodada:** o script para de iniciar alertas novos depois de 8
  minutos, e o job é encerrado em 10. Os alertas que ficarem para trás são os
  primeiros da rodada seguinte.
- **Limite por fonte:** cada site tem até 90 segundos para responder. Se
  travar (o LeilõesBR às vezes fica minutos sem responder), ele fica de fora
  daquela verificação, com o erro `tempo esgotado`, e é tentado de novo na
  próxima. Isso não gera avisos falsos: os lotes dele só contam como "novos"
  depois que ele responde.
- **Custo:** o repositório é público, então os minutos do GitHub Actions são
  gratuitos e ilimitados. Se ele virar privado, o plano gratuito tem 2.000
  minutos por mês; rodar a cada 2 horas usa cerca de 360 por mês, bem dentro
  do limite.

### Atrasos são normais

O GitHub não garante o horário exato das execuções agendadas: é comum atrasar
de 5 a 20 minutos em horários de pico, e às vezes uma rodada é pulada. Para
alertas de leilão isso não costuma fazer diferença.

### Desativação depois de 60 dias

Em repositórios públicos, o GitHub **desativa os workflows agendados depois de
60 dias sem nenhum commit**. Quando isso acontecer, você recebe um e-mail e
basta reativar em **Actions → Check alerts → Enable workflow** (ou fazer
qualquer commit).

## 4. Mudar a frequência

Edite a linha `cron` em `.github/workflows/check-alerts.yml`. O horário é
sempre em **UTC** (Brasília = UTC − 3).

| Frequência | `cron` |
| --- | --- |
| A cada 15 minutos | `"*/15 * * * *"` |
| A cada 30 minutos | `"*/30 * * * *"` |
| A cada hora | `"0 * * * *"` |
| A cada 2 horas (atual) | `"0 */2 * * *"` |
| Uma vez por dia, às 8h de Brasília | `"0 11 * * *"` |

O GitHub não aceita intervalos menores que 5 minutos.

## 5. Pausar o robô

Em **Actions → Check alerts**, clique no menu **⋯** e em **Disable workflow**.
Para voltar, **Enable workflow**. Para pausar só um alerta, desative-o na tela
**Alertas** do app.

## 6. Relação com o Vercel

O `vercel.json` continua com um cron diário (11h UTC) que chama
`/api/cron/check-alerts`. Ele é só uma rede de segurança e **não é
necessário**: com o GitHub Actions configurado, os alertas funcionam mesmo sem
o app publicado no Vercel. A tela **Alertas** do app, porém, continua
precisando do servidor rodando (local ou no Vercel) para criar e editar
alertas.

## Problemas comuns

| Sintoma no log | Causa provável |
| --- | --- |
| `DATABASE_URL não configurada` | Secret `DATABASE_URL` não cadastrado ou com nome diferente. |
| `getaddrinfo ENOTFOUND` / `ENETUNREACH` | Usando a Direct connection do Supabase. Troque pela string do Transaction pooler. |
| `password authentication failed` | Senha errada no `DATABASE_URL` ou caractere especial sem codificar. |
| `alerta N: ... erros: Telegram: chat not found` | `TELEGRAM_CHAT_ID` errado, ou você não mandou mensagem para o bot antes. |
| `alerta N: ... erros: Telegram: Unauthorized` | `TELEGRAM_BOT_TOKEN` errado ou revogado. |
| `alerta N: ... erros: leiloesbr: tempo esgotado` | O site não respondeu em 90 s nessa rodada. O alerta continua normalmente nas próximas. |
| `alerta N: ... erros: leiloesbr: ...` (outro erro) | A fonte falhou nessa rodada (site fora do ar ou mudou o layout). O alerta continua nas próximas. |
| Workflow não roda mais sozinho | Desativado após 60 dias sem commits (veja a seção 3). |
