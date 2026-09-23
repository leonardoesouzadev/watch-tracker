# Configuração: Supabase e Telegram

Passo a passo para ativar os **alertas** do Watch Tracker: o banco de dados
(Supabase), onde os alertas ficam salvos, e o bot do Telegram, que envia os
avisos.

Todas as variáveis ficam em `server/.env`. Se o arquivo ainda não existe,
crie-o a partir do modelo:

```bash
cp server/.env.example server/.env
```

> O `server/.env` está no `.gitignore` e nunca vai para o GitHub. Nunca coloque
> senhas ou tokens no `.env.example`, no README ou em qualquer outro arquivo
> versionado.

---

## 1. Banco de dados (Supabase)

### 1.1 Criar o projeto

1. Entre em [supabase.com](https://supabase.com) e faça login (dá para usar a
   conta do GitHub).
2. Clique em **New project** e preencha:
   - **Name:** `watch-tracker`
   - **Database Password:** clique em **Generate a password** e **guarde a
     senha**, porque ela não é exibida de novo. Se preferir criar uma, use só
     letras e números (veja [Senha com caracteres especiais](#senha-com-caracteres-especiais)).
   - **Region:** *South America (São Paulo)*
   - **Plan:** Free
3. Clique em **Create new project** e aguarde uns 2 minutos até terminar de
   provisionar.

### 1.2 Copiar a connection string

1. Dentro do projeto, clique no botão **Connect**, no topo da página.
2. Na aba **Connection String**, escolha o tipo **URI**.
3. Copie a string da seção **Transaction pooler** (porta **6543**):

   ```
   postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```

4. Troque `[YOUR-PASSWORD]` pela senha do projeto, **sem os colchetes**.

> **Use o Transaction pooler, não a "Direct connection".** A conexão direta
> (`db.xxxx.supabase.co:5432`) só funciona em IPv6 e costuma falhar em redes
> domésticas e no Vercel.

### 1.3 Colocar no `.env`

```
DATABASE_URL=postgresql://postgres.abcdefghij:SuaSenha123@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

Sem aspas e sem espaços. Salve o arquivo.

### 1.4 Criar as tabelas

Não é preciso rodar SQL no Supabase. Na primeira requisição que usa o banco, o
servidor cria sozinho as tabelas `alerts` e `alert_listings`
(`CREATE TABLE IF NOT EXISTS`, em `server/src/alerts/db.js`).

1. Na raiz do projeto, rode `npm run dev`.
2. Abra `http://localhost:5173` e entre na tela **Alertas**.
3. No Supabase, abra **Table Editor** no menu lateral: as duas tabelas devem
   aparecer lá.

### Senha com caracteres especiais

Se a senha tiver `@ # / ? % :` ou espaços, esses caracteres precisam ser
codificados na URL (por exemplo, `@` vira `%40` e `#` vira `%23`). Sem isso, a
conexão falha com erro de autenticação ou de host. O caminho mais simples é
redefinir a senha com uma que tenha só letras e números, em *Project Settings →
Database → Reset database password*.

---

## 2. Bot do Telegram

### 2.1 Criar o bot

1. No Telegram, procure por **@BotFather**. É o oficial, com o selo azul de
   verificado.
2. Toque em **Iniciar** (ou mande `/start`) e depois mande `/newbot`.
3. Informe:
   - **Nome:** qualquer um, por exemplo `Watch Tracker Alertas`.
   - **Username:** precisa ser único e terminar em `bot`, por exemplo
     `meu_watchtracker_bot`.
4. O BotFather responde com o **token**, no formato
   `1234567890:AAH...`. Esse token é a senha do bot: não compartilhe com
   ninguém.

No `.env`:

```
TELEGRAM_BOT_TOKEN=1234567890:AAH...
```

### 2.2 Descobrir o Chat ID

1. Abra o link do seu bot (`t.me/seu_bot`, que aparece na mensagem do
   BotFather), toque em **Iniciar** e mande qualquer mensagem, como `oi`. Esse
   passo é obrigatório: um bot não consegue mandar mensagem para quem nunca
   falou com ele.
2. No navegador, abra o endereço abaixo, trocando `<TOKEN>` pelo seu token (sem
   os `< >`):

   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```

3. Na resposta, procure o trecho `"chat":{"id":...}`:

   ```json
   "chat":{"id":123456789,"first_name":"Seu Nome","type":"private"}
   ```

4. Copie esse número para o `.env`:

   ```
   TELEGRAM_CHAT_ID=123456789
   ```

Se a resposta vier como `"result":[]`, a mensagem ainda não chegou: mande outra
mensagem para o bot e atualize a página.

### 2.3 Receber os alertas em um grupo (opcional)

1. Adicione o bot ao grupo.
2. Mande uma mensagem no grupo.
3. Repita o passo 2.2. O ID de grupo começa com `-` (por exemplo,
   `-1001234567890`): copie com o sinal de menos.

### 2.4 Se o token vazar

Mande `/revoke` para o @BotFather, escolha o bot e ele gera um token novo.
Atualize o `TELEGRAM_BOT_TOKEN` no `.env` (e no Vercel, se já estiver
publicado).

---

## 3. Testar tudo

1. Salve o `server/.env`.
2. Reinicie o `npm run dev`. O servidor só lê o `.env` quando sobe.
3. No app, abra a tela **Alertas**:
   - A tela carrega sem erro de banco: o Supabase está conectado.
   - **Enviar teste** manda uma mensagem pelo bot: o Telegram está
     configurado.
4. Crie um alerta e clique em **Verificar agora**. Ele aparece como uma linha
   na tabela `alerts` do Supabase.

Para o robô verificar os alertas sozinho enquanto roda localmente, defina
também:

```
ALERTS_INTERVAL_MINUTES=15
```

## 4. Verificação automática no GitHub

Para os alertas rodarem sozinhos a cada 2 horas, sem depender do seu
computador ou do Vercel, siga o [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md).

## 5. Publicar no Vercel

Cadastre as mesmas variáveis em *Settings → Environment Variables* do projeto
no Vercel (`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e as
demais), mas deixe `ALERTS_INTERVAL_MINUTES` vazio: no Vercel, quem dispara o
robô é o agendador (veja a seção [Alertas](README.md#alertas) do README).

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| `DATABASE_URL não configurada no servidor` | Linha vazia no `.env`, arquivo não salvo ou servidor não reiniciado. |
| `getaddrinfo ENOTFOUND` / `ENETUNREACH` | Usando a Direct connection (IPv6). Troque pela string do Transaction pooler. |
| `password authentication failed` | Senha errada, `[YOUR-PASSWORD]` não substituído ou caractere especial sem codificar. |
| Telegram: `chat not found` | Você não mandou mensagem para o bot antes, ou o Chat ID está errado (em grupo, faltou o `-`). |
| Telegram: `Unauthorized` | Token errado ou revogado. |
