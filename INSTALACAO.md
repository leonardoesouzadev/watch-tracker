# Instalação para um cliente

Roteiro para montar uma cópia do Watch Tracker para um cliente. A
configuração do Telegram e do e-mail é feita no navegador, pela página
`/install`. Fora dela, só o banco de dados e o agendador do robô precisam ser
configurados à mão.

Tempo estimado: 15 minutos.

---

## 1. Copiar o repositório

Crie um repositório **privado** para o cliente com o código deste projeto
(ex: *Use this template* ou um push do código para um repositório novo). Cada
cliente tem o seu repositório, porque o robô de alertas roda no GitHub Actions
de cada um.

## 2. Publicar no Vercel com um banco

1. No [Vercel](https://vercel.com), clique em **Add New → Project** e importe
   o repositório do cliente. Não precisa mudar nada nas configurações de
   build: o `vercel.json` já cuida disso.
2. Depois do primeiro deploy, abra **Storage → Create Database** e conecte um
   **Neon** ou **Supabase** (tem plano grátis). O Vercel cria sozinho a
   variável com o endereço do banco (`DATABASE_URL` ou `POSTGRES_URL`); o app
   aceita as duas.
3. Em **Deployments**, clique em **Redeploy** para o app enxergar o banco.

> Já tem um Postgres? Cadastre `DATABASE_URL` em **Settings → Environment
> Variables** no lugar do passo 2. No Supabase, use a string do *Transaction
> pooler* (porta 6543).

## 3. Rodar o instalador

Abra `https://<endereço-do-app>/install` e siga os 5 passos:

1. **Bot:** crie o bot no [@BotFather](https://t.me/BotFather) (`/newbot`) e
   cole o token. O Telegram não permite criar bots automaticamente, então
   este é o único passo manual no Telegram.
2. **Chat:** o cliente manda `/start` para o bot, e a página detecta o chat
   sozinha. Para receber num grupo, adicione o bot ao grupo e mande uma
   mensagem lá.
3. **E-mail (opcional):** API key do [Resend](https://resend.com) e o e-mail
   de destino. O botão **Enviar teste** confere antes de salvar.
4. **eBay e tradução (opcional):** chaves do eBay e da Anthropic, cada uma
   com botão de teste (detalhes abaixo). Sem elas, o eBay fica fora das buscas
   e os títulos em japonês ficam no original.
5. **Concluir:** o instalador salva tudo no banco, configura nome, descrição e
   comandos do bot, conecta o bot ao app e manda uma mensagem de boas-vindas.

### Chaves do eBay

1. Crie uma conta em [developer.ebay.com](https://developer.ebay.com) e
   espere a aprovação (costuma levar até um dia).
2. Em **Application Keys**, crie um keyset de **Production** (não Sandbox).
3. O eBay só ativa o keyset de produção depois de resolver as notificações
   de exclusão de conta. Clique em **Notifications** ao lado do App ID e, na
   página *Marketplace Account Deletion*, ative **"Not persisting eBay
   data"**, escolha o motivo e envie. Atenção: os alertas e os lotes
   acompanhados guardam dados dos anúncios (título, preço, vendedor); avalie
   se essa declaração vale para o seu uso.
4. Copie o **App ID** e o **Cert ID** para o instalador. O limite padrão é de
   5.000 buscas por dia.

### Chave da Anthropic (tradução)

Crie a chave em [console.anthropic.com](https://console.anthropic.com). O
custo é por uso e fica baixo, porque cada título é traduzido uma única vez.

Rode o instalador **no endereço publicado** (HTTPS). Rodando em `localhost`, o
bot envia alertas mas não responde comandos, porque o Telegram só entrega
mensagens para endereços HTTPS.

## 4. Ligar o robô de alertas

No repositório do cliente no GitHub, em **Settings → Secrets and variables →
Actions**, cadastre **só** o secret `DATABASE_URL`, com o mesmo endereço do
banco que o Vercel usa. O robô lê o resto das configurações do banco.

Para testar na hora: **Actions → Check alerts → Run workflow**. Detalhes em
[GITHUB_ACTIONS.md](GITHUB_ACTIONS.md).

> O GitHub só roda o agendador com o repositório ativo: sem nenhum commit por
> 60 dias, ele desativa o workflow e manda um e-mail avisando. Basta reativar
> em **Actions**.

---

## Alterar a configuração depois

Abra `/install` de novo. Como o app já está instalado, a página pede um
código de 6 dígitos, que é enviado para o chat do Telegram configurado. Isso
impede que outra pessoa que descubra o endereço troque a configuração.

- O código vale por 10 minutos e é invalidado depois de 5 tentativas erradas.
- Se o chat antigo não existir mais (ex: o bot foi apagado), cadastre as novas
  variáveis direto no Vercel, ou apague a linha `INSTALLED_AT` da tabela
  `settings` no banco para liberar o instalador.

## Onde ficam as configurações

Na tabela `settings` do banco. Os valores salvos pelo instalador têm
prioridade sobre as variáveis de ambiente, que continuam funcionando como
alternativa (é assim que as instalações antigas, configuradas pelo `.env`,
seguem funcionando).

| Fica só em variável de ambiente | Motivo |
| --- | --- |
| `DATABASE_URL` / `POSTGRES_URL` | É onde o instalador salva o resto |
| `CRON_SECRET` | O Vercel lê direto da variável para chamar o cron diário (rede de segurança; opcional) |
| `ALERTS_INTERVAL_MINUTES`, `PORT` | Só para rodar fora do Vercel |

> Até o instalador ser concluído, qualquer pessoa que abrir `/install` pode
> configurar o app. Rode o instalador logo depois do deploy.
