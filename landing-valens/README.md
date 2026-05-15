# VALENS — Landing Page

Plataforma integrada para gestão da saúde pública.

## Estrutura

```
landing-valens/
├── index.html          ← landing estática completa (HTML + CSS inline)
├── assets/             ← assets futuros (screenshots, vídeos)
├── brand/
│   ├── favicon/
│   │   ├── favicon.svg
│   │   ├── favicon-32.png
│   │   ├── favicon-16.png
│   │   └── apple-touch-icon.png
│   └── social/
│       ├── og-image.png
│       └── twitter-card.png
└── README.md
```

## Deploy — Cloudflare Pages

| Configuração       | Valor                  |
|--------------------|------------------------|
| Framework preset   | **None**               |
| Build command      | *(vazio)*              |
| Output directory   | `/` (raiz)             |
| Root directory     | `landing-valens`       |

Passos:
1. Cloudflare Dashboard → Pages → Create a project
2. Connect Git repository
3. Configurar conforme tabela acima
4. Deploy

## Pós-deploy — atualizar OG tags

Após obter a URL final do Cloudflare Pages, atualizar em `index.html`:

```html
<meta property="og:image" content="https://SEU-DOMINIO/brand/social/og-image.png" />
<meta name="twitter:image" content="https://SEU-DOMINIO/brand/social/twitter-card.png" />
```

OG images precisam de URL absoluta para funcionar no WhatsApp / Twitter / LinkedIn.

## Notas

- HTML puro estático — sem React, sem Vite, sem build step
- CSS inline na `<style>` tag — zero dependências externas exceto Google Fonts
- Favicon SVG inline + PNG fallbacks
- Totalmente responsivo (mobile-first)
- `og-image.png` e `twitter-card.png` ainda têm identidade visual SIGUS —
  regenerar com branding VALENS antes de lançamento público
