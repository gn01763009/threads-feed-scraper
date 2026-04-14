# 🧵 Threads Scraper — Documentação Oficial

O **Threads Scraper** é uma solução unificada para extração de dados públicos do Meta Threads. Desenvolvido para máxima eficiência, ele permite coletar dados de **perfis, hashtags, buscas por keywords, posts individuais e feeds** sem a necessidade de login ou tokens oficiais da API da Meta.

## 🚀 Visão Geral

Este Actor foi desenhado para ser **plug-and-play**. Ideal para times de marketing, growth engineers, pesquisadores de dados e desenvolvedores de SaaS que precisam de inteligência competitiva e *social listening* em escala.

* **Zero Setup:** Sem necessidade de login ou proxy complexo.
* **Escalabilidade:** Suporta input em massa (bulk) de até 100 entradas por execução.
* **Custo-Benefício:** Modelo *pay-as-you-go* de **$0.005 por resultado**, sem taxas de adesão.

---

## 📊 Data Points (Campos Extraídos)

Para cada post processado, o scraper entrega um dataset estruturado com os seguintes campos:

### Objeto: Post

* `postId`, `postUrl`: Identificadores únicos.
* `content`: Conteúdo textual completo.
* `publishedAt`: Timestamp original e formatado (ISO).
* `metrics`: Contagens de `likes`, `replies`, `reposts`, `shares`, `views` e `quotes`.
* `media`: Detecção de tipo (`photo`, `video`, `carousel`) e lista de URLs de mídia.
* `threadParts[]`: Agrupamento automático de posts encadeados (threads longas).

### Objeto: Autor & Respostas

* `author`: Handle do usuário.
* `replies[]`: (Apenas no modo `post`) Lista das 20 principais respostas, incluindo autor e conteúdo.

> **Nota Técnica:** Os nomes dos campos (chaves do JSON) são mantidos em inglês para garantir compatibilidade com pipelines de dados internacionais e bibliotecas de integração.

---

## ⚙️ Modos de Operação

O Scraper opera em 5 modos distintos, selecionáveis via parâmetro `mode`:

| Modo | Descrição | Input Principal |
| :--- | :--- | :--- |
| **👤 User** | Extrai o histórico de posts de perfis específicos. | `usernames[]` |
| **🏷️ Hashtag** | Scrape de posts associados a uma hashtag ou tópico. | `keywords[]` |
| **🔎 Search** | Busca global por palavras-chave (Top ou Recentes). | `keywords[]` |
| **💬 Post** | Foca em um post específico e suas respostas (replies). | `postUrls[]` |
| **📰 Feed** | Coleta dados de qualquer URL de feed customizado. | `feedUrls[]` |

---

## 🛠️ Configuração de Entrada (Inputs)

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `mode` | `enum` | Escolha entre `user`, `hashtag`, `search`, `post`, `feed`. |
| `usernames` | `array` | Lista de handles (ex: `["zuck", "mosseri"]`). Máx 100. |
| `bulkUsernames` | `string` | Texto livre para colar lista de usuários (um por linha). |
| `maxPosts` | `int` | Limite de resultados por fonte (Default: 50). |
| `dateFrom` | `string` | Filtro temporal (ex: `2026-01-01` ou `7 days`). |
| `searchSort` | `enum` | Ordenação para busca: `top` ou `recent`. |

---

## 💡 Exemplos de Uso

### Extração de Perfis (JSON)

```json
{
  "mode": "user",
  "usernames": ["zuck", "mosseri"],
  "maxPosts": 100
}
```

### Monitoramento de Tendências (Keyword Search)

```json
{
  "mode": "search",
  "keywords": ["Inteligência Artificial", "SaaS"],
  "searchSort": "recent",
  "dateFrom": "1 month"
}
```

---

## ⚠️ Notas e Limites Técnicos

* **Early Exit:** O scraper possui inteligência para interromper a execução caso detecte feeds inativos, economizando créditos.
* **Normalização de Métricas:** Valores abreviados pelo Threads (ex: `10K`) são automaticamente convertidos para inteiros (`10000`) para facilitar cálculos.
* **Dados Públicos:** O acesso é limitado a conteúdos visíveis sem login. Perfis privados não são acessíveis.
* **Threads Encadeadas:** Posts divididos em várias partes são mesclados em um único registro no campo `threadParts[]`.

---

## ❓ Perguntas Frequentes (FAQ)

**Como passar os usernames corretamente?**
Utilize apenas o handle simples: `usuario`, sem o símbolo `@`. O sistema limpa automaticamente URLs caso você as insira por engano.

**Quais formatos de exportação são aceitos?**
Como o Scraper roda na infraestrutura Apify, você pode exportar em **JSON, CSV, Excel, XML ou HTML Table**.

**Por que não usar a API Oficial da Meta?**
A API oficial é voltada para gestão de conteúdo próprio. Para **Pesquisa de Mercado** e **Análise Competitiva**, o Scraper é mais ágil, não exige aprovação de App e oferece acesso a dados que a API restringe.

---

## ⚖️ Aviso Legal e Compliance

Este software coleta apenas dados publicamente disponíveis. O uso desta ferramenta deve estar em conformidade com as regulamentações locais de proteção de dados (como a **LGPD** no Brasil e **GDPR** na Europa). Recomendamos o uso ético para fins de pesquisa, monitoramento de marca e analytics.

---

*Desenvolvido para profissionais de dados que buscam agilidade e precisão no ecossistema Meta.*
