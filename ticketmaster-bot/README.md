# Ticketmaster Personal Ticket Bot

Bot pessoal para acompanhar o evento da Ticketmaster, esperar fila de forma normal, tentar reservar 1 ingresso de Arquibancada no carrinho e avisar pelo WhatsApp.

## O que ele faz

- Abre um navegador real com perfil persistente, então cookies/carrinho ficam salvos em `.browser-profile`.
- Entra na fila normalmente se o site colocar você em fila.
- Para quando aparecer CAPTCHA, bloqueio ou validação humana. Você resolve manualmente no navegador aberto.
- Procura o setor configurado, por padrão `Arquibancada`.
- Em modo seguro, apenas avisa/gera log. Com `ADD_TO_CART=true`, tenta selecionar 1 ingresso e avançar até carrinho/checkout, sem pagar.
- Envia WhatsApp via Meta WhatsApp Cloud API ou Twilio.

## Limites importantes

Este bot não burla CAPTCHA, fila virtual, bloqueio anti-bot, limite de CPF, login, rate limit, termos do site ou qualquer mecanismo de proteção. Ele usa um navegador visível e depende de você para qualquer etapa humana. A Ticketmaster pode mudar a tela a qualquer momento, então a primeira execução deve ser tratada como calibração.

## Instalação

```powershell
cd ticketmaster-bot
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

Edite `.env` e preencha:

```ini
TARGET_SECTOR=Arquibancada
TARGET_QUANTITY=1
CHECK_INTERVAL_SECONDS=30
QUEUE_CHECK_INTERVAL_SECONDS=60
WHATSAPP_PROVIDER=cloud
WHATSAPP_TO=55DDDNUMERO
WHATSAPP_CLOUD_TOKEN=seu_token
WHATSAPP_CLOUD_PHONE_NUMBER_ID=seu_phone_number_id
```

Se preferir Twilio:

```ini
WHATSAPP_PROVIDER=twilio
WHATSAPP_TO=whatsapp:+55DDDNUMERO
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=whatsapp:+14155238886
```

## Login opcional

```powershell
npm run login
```

Use esse comando somente se você quiser deixar a sessão pronta antes. Se a Ticketmaster permite colocar no carrinho sem login, você pode pular esse passo e rodar `npm run start` direto.

Se o site pedir login depois de adicionar ao carrinho ou ao entrar no checkout, o bot avisa pelo WhatsApp e fica aguardando você concluir essa etapa manualmente no navegador aberto.

## Rodar em modo seguro

```powershell
npm run start
```

Com o `.env.example`, ele roda com:

```ini
DRY_RUN=true
ADD_TO_CART=false
```

Nesse modo ele monitora e avisa, mas não tenta clicar para adicionar no carrinho.

## Frequência de verificação

Use `CHECK_INTERVAL_SECONDS` para controlar o intervalo fora da fila:

```ini
CHECK_INTERVAL_SECONDS=30
```

O bot impõe mínimo de 30 segundos para reduzir risco de bloqueio por atividade suspeita. Se o site colocar você em fila, ele usa `QUEUE_CHECK_INTERVAL_SECONDS` e não recarrega a página, porque refresh na fila pode fazer você perder posição.

## Tentar adicionar ao carrinho

Depois de testar fila/setor e confirmar que a página está aparecendo corretamente:

```ini
DRY_RUN=false
ADD_TO_CART=true
```

Então rode:

```powershell
npm run start
```

Quando conseguir chegar em carrinho/checkout, ele envia WhatsApp e mantém o navegador aberto para você finalizar a compra.

## Calibrar seletores se a tela mudar

Se ele não achar o setor ou os botões, rode:

```powershell
npm run inspect
```

Isso imprime textos e botões visíveis da página atual para ajustarmos os seletores com segurança, sem adivinhar.
