# Threads Scraper — Posts, Perfis, Hashtags e Busca por Palavra-chave

Um scraper unificado do Meta Threads para **perfis de usuários**, **hashtags**, **busca por palavra-chave**, **posts individuais com respostas** e **feeds personalizados**. Sem login, sem API token, colar em massa até 100 usuários ou palavras-chave por execução, e preço fixo de **$0.005 por resultado** sem taxa de início. Feito para times de marketing, pesquisadores, desenvolvedores SaaS e social listening que precisam de dados do Threads sem montar a API oficial da Meta.

---

## O que este scraper extrai

Para cada post:

- `postId`, `postUrl`, `content`, `publishedAt`, `publishedAtISO`
- `mediaType` (`text` / `photo` / `video` / `carousel`) e `mediaUrls[]`
- Engajamento: `likeCount`, `replyCount`, `repostCount`, `shareCount`, `viewCount`, `quoteCount`
- `sourceType` (qual modo gerou o resultado) e `sourceQuery` (o username / palavra-chave / URL exato)
- Timestamp `scrapedAt`
- `threadParts[]` — posts encadeados de múltiplos segmentos são mesclados automaticamente, preservando cada segmento

Para o autor:

- Handle `author`

Para respostas (apenas no modo `post`):

- `replies[]` — até 20 respostas principais com `author`, `content`, `publishedAt`, `likeCount`

As chaves dos campos do dataset são em inglês em todos os idiomas — suas integrações continuam portáveis.

---

## Cinco modos, um actor

| Modo | O que faz | Campo de entrada |
|------|-----------|------------------|
| 👤 **User** | Extrai todos os posts do perfil de um usuário | `usernames[]` |
| 🏷️ **Hashtag** | Extrai uma página de hashtag / tópico | `keywords[]` |
| 🔎 **Search** | Busca por palavra-chave com ordenação Top / Recentes | `keywords[]` + `searchSort` |
| 💬 **Post** | Post individual com até 20 respostas principais | `postUrls[]` |
| 📰 **Feed** | Qualquer URL de feed personalizado do Threads | `feedUrls[]` |

Escolha um modo por execução no menu **Mode**. Scrapers concorrentes dividem isso em 4–5 actors separados — este mantém tudo em uma base de código única para simplificar sua integração.

---

## Entradas

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|:-----------:|:------:|-----------|
| `mode` | enum | recomendado | `user` | Um de `user`, `hashtag`, `search`, `post`, `feed`. Se omitido, detectado automaticamente pelo campo preenchido. |
| `usernames` | string[] | para modo `user` | — | Usernames simples, sem `@`, sem URL. Até **100** por vez. |
| `bulkUsernames` | string | opcional | — | Textarea — cole um username por linha (copie uma coluna de planilha direto). Mesclado em `usernames`. |
| `keywords` | string[] | para `hashtag` / `search` | — | Palavras-chave ou hashtags (`#` inicial opcional). Até **100** por vez. |
| `bulkKeywords` | string | opcional | — | Textarea para colar palavras-chave. Mesclado em `keywords`. |
| `postUrls` | string[] | para modo `post` | — | URLs completas de posts — respostas são extraídas automaticamente. |
| `feedUrls` | string[] | para modo `feed` | — | URLs de feeds personalizados do Threads. |
| `searchSort` | enum | opcional | `top` | `top` ou `recent`. Aplica-se apenas ao modo `search`. |
| `dateFrom` | string | opcional | — | `YYYY-MM-DD` **ou** relativo: `7 days`, `1 month`, `2 weeks`, `1 year`. |
| `dateTo` | string | opcional | — | Mesmo formato de `dateFrom`. |
| `maxPosts` | integer | opcional | `50` | Máximo de posts por fonte, 1–500. Rolagem gerenciada automaticamente. |

---

## Exemplos de uso

**👤 Extrair três perfis de usuário**

```json
{
  "mode": "user",
  "usernames": ["zuck", "mosseri", "finkd"],
  "maxPosts": 50
}
```

**🏷️ Extrair uma hashtag no último mês**

```json
{
  "mode": "hashtag",
  "keywords": ["#NoticiasIA"],
  "dateFrom": "1 month",
  "maxPosts": 200
}
```

**🔎 Busca por palavra-chave, posts mais recentes dos últimos 7 dias**

```json
{
  "mode": "search",
  "keywords": ["agentes LLM", "vibe coding"],
  "searchSort": "recent",
  "dateFrom": "7 days",
  "maxPosts": 100
}
```

**💬 Post individual + respostas principais**

```json
{
  "mode": "post",
  "postUrls": ["https://www.threads.com/@zuck/post/ABC123"]
}
```

**📋 Colagem em massa — 80 contas de KOLs a partir de uma planilha**

Copie uma coluna direto do Google Sheets / Excel e cole em `bulkUsernames` — sem clicar em "Adicionar" 80 vezes.

**Formato no Console: um username por linha, pressione Enter entre cada — sem aspas, sem vírgulas.** Assim:

```
zuck
mosseri
finkd
threadsapp
taylornikolai
```

Se estiver chamando a API em vez de usar o Console, `bulkUsernames` é uma única string com `\n` como separador de linha:

```json
{
  "mode": "user",
  "bulkUsernames": "zuck\nmosseri\nfinkd\nthreadsapp\ntaylornikolai",
  "maxPosts": 20
}
```

---

## Notas e limitações

- **`maxPosts` é um teto, não uma garantia.** Perfis inativos ou hashtags de nicho podem retornar menos posts. O scraper para após 5 rolagens consecutivas sem novidades, em vez de queimar tempo.
- **Datas relativas são avaliadas no momento da execução.** `"7 days"` hoje e amanhã produzem datas absolutas diferentes — útil para runs agendadas que sempre buscam "a última semana".
- **Contagens de engajamento podem ser aproximadas.** O Threads abrevia números grandes (ex. `12.5K`) — o actor normaliza para inteiros, então `12500` é o valor convertido, não uma contagem exata.
- **Respostas só são extraídas no modo `post`**, limitadas às ~20 primeiras respostas principais.
- **Sem login = apenas dados públicos.** Contas privadas e conteúdo só-para-seguidores não são acessíveis.
- **Threads encadeados são mesclados automaticamente.** Posts de múltiplos segmentos (`1/`, `2/`, `3/`) são combinados em um único registro via `threadParts[]`.

---

## FAQ

**P: Como passar usernames? Com `@` ou sem, URL completa ou simples?**
Simples é o canônico: `zuck`, não `@zuck` nem `https://www.threads.com/@zuck`. O `@` inicial é removido automaticamente, e o campo legado `profileUrls` da v0.3 é migrado automaticamente — integrações de API existentes não quebram.

**P: Recebi um resultado parcial — menos posts do que `maxPosts`. Por quê?**
Ou o perfil realmente tem menos posts, ou a hashtag é de nicho, ou o feed do Threads parou de retornar novos itens após várias rolagens. Verifique `totalItems` no log da execução — essa é a contagem real.

**P: Alguns campos vêm `null` ou `0`. É bug?**
O Threads renderiza contagens de engajamento de forma preguiçosa. Contagens de visualizações em particular só aparecem em contas com alcance público suficiente; contagens de citações dependem do tipo de post. Campos faltando são lacunas de dados do próprio Threads, não falhas silenciosas do actor.

**P: `dateFrom` / `dateTo` aplicam-se aos modos `user` e `post`?**
O filtro de data roda em todos os modos, mas só importa para `search`, `hashtag`, `user` e `feed` — o modo `post` extrai URLs específicas independentemente da data. Expressões relativas como `"1 month"` são resolvidas para `YYYY-MM-DD` absoluto antes do filtro.

**P: Quais formatos de saída são suportados?**
JSON, CSV, Excel, XML, tabela HTML — exports padrão do dataset Apify. Disponíveis pelo Console, pela API de datasets ou pelas bibliotecas cliente Apify (Python, JavaScript). Integra também com Zapier, Make, n8n e Google Sheets.

---

## Alternativa: a API oficial do Threads

A Meta publica uma [API oficial do Threads](https://developers.facebook.com/docs/threads), mas ela tem restrições rígidas para casos de uso com dados públicos:

- Lê apenas dados de contas que você possui ou que concederam acesso — sem monitoramento de concorrentes, sem pesquisa de tendências, sem scraping de hashtag
- Exige configuração OAuth, revisão de app para ferramentas de publicação e uma conta de Facebook Developer
- Os limites de requisição e a cobertura de endpoints são mais estreitos do que o visível para um navegador sem login

Para pesquisa de mercado, social listening, análise de tendências e inteligência competitiva sobre dados públicos do Threads, este actor é um caminho mais simples. Para postar, gerenciar sua própria conta ou construir automação em contas autorizadas, use a API oficial da Meta.

---

## Aviso legal

Este scraper coleta apenas dados publicamente visíveis do Threads. Ele não acessa contas privadas, não contorna autenticação e não extrai informações pessoais além do que um visitante sem login pode ver. Usuários são responsáveis por garantir que seu caso de uso esteja em conformidade com a lei aplicável (LGPD, GDPR, CCPA, regulamentações locais de proteção de dados) e com os Termos de Serviço da Meta. Use a ferramenta para pesquisa legítima, monitoramento e analytics — não para spam, assédio ou revenda não autorizada de dados.

---

*Threads scraper · alternativa à API do Meta Threads · posts do Threads · scraper de hashtag Threads · busca por palavra-chave Threads · scraper de perfil Threads · respostas Threads · feed personalizado Threads · social listening · monitoramento de marca · inteligência competitiva · rastreamento de KOL · analytics de influenciadores · dados de marketing*
