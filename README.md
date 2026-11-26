# 📚 Biblioteca Vesiuol

**Um site pessoal de leitura, dados e histórias — feito por uma jornalista de dados para acompanhar tudo o que lê.**

🔗 **Site ao vivo:** [vesiuol.github.io/vesiuol](https://vesiuol.github.io/vesiuol/)

---

## Sobre o projeto

Biblioteca Vesiuol é o arquivo literário pessoal de Louise Victoria: um site que transforma anos de registros de leitura em painéis, gráficos e histórias navegáveis com a ajuda do Claude. Um pensa, o outro executa.

Além do histórico de leituras, o site documenta o **Desafio Livros pelo Mundo** — a meta de ler um livro de cada um dos 209 países do mundo, com mapa, status por país e progresso atualizado automaticamente. E tem um **blog**, com textos, resenhas e bastidores do Desafio.

Mais do que um dashboard, o projeto nasceu do olhar de jornalismo de dados da autora: cada gráfico existe para contar uma história sobre hábitos de leitura, diversidade de autoria e representatividade — não só para exibir números.

## O que tem no site

| Página | O que mostra |
| --- | --- |
| **Início** | KPIs gerais — livros lidos, páginas, autores, países, idiomas |
| **Estante** | Todos os livros desde 2020, com filtros, busca, mapa, séries e gráficos por gênero, formato, faixa etária, diversidade de autoria e mais |
| **Histórico → Visão geral** | Evolução ano a ano desde 2013 |
| **Histórico → 2026** | Leituras do ano corrente, atualizadas automaticamente |
| **Desafio** | Desafio Livros pelo Mundo — mapa e tabela dos 209 países, com status de leitura |
| **Blog** | Textos, resenhas e bastidores do Desafio, publicados a partir do Notion |
| **Sobre** | Apresentação da autora e a história por trás do projeto |

## Stack técnica

- **HTML/CSS/JS** puro — sem framework de build, páginas estáticas hospedadas no GitHub Pages
- **[Chart.js](https://www.chartjs.org/)** para os gráficos, **[Leaflet](https://leafletjs.com/)** para os mapas e **[PapaParse](https://www.papaparse.com/)** como plano B para ler CSV (carregados sob demanda)
- **Google Fonts** — Cormorant Garamond (títulos), DM Sans (corpo de texto) e Lora (títulos de cards)
- **GitHub Actions** — pipelines que buscam dados de planilhas e do Notion e publicam arquivos estáticos direto no repositório, sem backend
- **Google Tag Manager + Google Analytics 4**, com banner de consentimento de cookies (Consent Mode v2)

## Arquitetura de dados

Os dados de leitura vivem em **planilhas do Google Sheets**, preenchidas à mão a cada livro lido. O Desafio Livros pelo Mundo, as séries da estante e os textos do blog vivem em **bases do Notion**.

Workflows do GitHub Actions rodam periodicamente (de hora em hora ou uma vez por dia), buscam esses dados e publicam snapshots estáticos dentro do próprio repositório — assim o site carrega rápido e sem depender de chamadas de API no navegador de quem visita.

```
Google Sheets / Notion  →  GitHub Actions  →  data/*.csv, data/*.json  →  site estático
```

## Páginas compartilhadas (nav, rodapé, GTM)

O menu, o rodapé e o código do GTM vivem **uma vez só**, em `partials/`. O script `scripts/sync-partials.js` copia esses trechos para todas as páginas e calcula a data "Atualizado em" do rodapé pelo último commit de cada arquivo. Posts novos do blog são encontrados automaticamente — não é preciso listá-los em nenhum lugar. **Nunca edite o menu ou o rodapé direto nas páginas**: edite `partials/` e a Action faz o resto.

## Estrutura do repositório

```
├── index.html            # Início
├── 404.html              # Página não encontrada
├── estante/index.html    # Estante
├── historico/index.html  # Histórico — visão geral
├── 2026/index.html       # Histórico — leituras de 2026
├── desafio/index.html    # Desafio Livros pelo Mundo
├── sobre/index.html      # Sobre a autora e o projeto
├── blog/                 # Índice do blog + um post por pasta (blog/<slug>/index.html)
├── partials/             # Nav, rodapé e GTM (fonte única)
├── assets/               # CSS compartilhado, config, cadastro de países, busca, imagens
├── scripts/              # Scripts de busca de dados, geração do blog e sync das partials
├── data/                 # Snapshots gerados automaticamente (CSV/JSON)
├── llms.txt, robots.txt, sitemap.xml
└── .github/workflows/    # Pipelines automáticos (dados, blog, sync, checagem de países)
```

Cada página é uma pasta com `index.html`, para o endereço ficar limpo (`/estante/`, sem `.html`).

## Autoria

Criado e mantido por **[Louise Victoria](https://vesiuol.github.io/vesiuol/sobre/)** — jornalista e entusiasta de dados.

## Licença

Este projeto está sob a licença MIT — veja o arquivo [LICENSE](./LICENSE) para mais detalhes.
