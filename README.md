# 📚 Biblioteca Vesiuol

**Um site pessoal de leitura, dados e histórias — feito por uma jornalista de dados para acompanhar tudo o que lê.**

🔗 **Site ao vivo:** [vesiuol.github.io/vesiuol](https://vesiuol.github.io/vesiuol/)

---

## Sobre o projeto

Biblioteca Vesiuol é o arquivo literário pessoal de Louise Victoria: um site que transforma anos de registros de leitura em painéis, gráficos e histórias navegáveis. Além do histórico de leituras, o site documenta o **Desafio Livros pelo Mundo** — a meta de ler um livro de cada um dos 209 países do mundo, com mapa, status por país e progresso ao vivo.

Mais do que um dashboard, o projeto nasceu do olhar de jornalismo de dados da autora: cada gráfico existe para contar uma história sobre hábitos de leitura, diversidade de autoria e representatividade — não só para exibir números.

## O que tem no site

| Página | O que mostra |
| --- | --- |
| **Início** | KPIs gerais — livros lidos, páginas, autores, países, idiomas |
| **Estante** | Todos os livros lidos desde 2020, com filtros e gráficos por gênero, formato, faixa etária, diversidade de autoria e mais |
| **2026** | Leituras do ano corrente, atualizadas automaticamente |
| **Histórico** | Evolução ano a ano desde 2013 |
| **Desafio** | Desafio Livros pelo Mundo — mapa e tabela dos 209 países, com status de leitura |
| **Sobre** | Apresentação da autora e a história por trás do projeto |

## Stack técnica

- **HTML/CSS/JS** puro — sem framework de build, seis páginas estáticas hospedadas via GitHub Pages
- **[Chart.js](https://www.chartjs.org/)** + `chartjs-plugin-datalabels` para todos os gráficos
- **[PapaParse](https://www.papaparse.com/)** para ler dados publicados como CSV
- **[Leaflet](https://leafletjs.com/)** para o mapa do Desafio Livros pelo Mundo
- **Google Fonts** — Cormorant Garamond (títulos) e DM Sans (corpo de texto)
- **GitHub Actions** — pipelines automatizados que buscam dados de planilhas/Notion e publicam arquivos estáticos (`data/2026.csv`, `data/desafio.json`) direto no repositório, sem precisar de backend
- **Google Analytics 4** para métricas de uso

## Arquitetura de dados

Os dados de leitura vivem em **planilhas do Google Sheets**, preenchidas manualmente pela autora a cada livro lido. O Desafio Livros pelo Mundo é gerenciado em uma **base do Notion** (209 países, livro, autor/a, status de leitura).

Um fluxo de **GitHub Actions** roda periodicamente para buscar esses dados nas fontes originais e publicar snapshots estáticos (CSV/JSON) dentro do próprio repositório — assim o site carrega rápido e sem depender de chamadas de API em tempo real no navegador de quem visita.

```
Google Sheets / Notion  →  GitHub Actions  →  data/*.csv, data/*.json  →  site estático
```

## Estrutura do repositório

```
├── index.html          # Home — KPIs gerais
├── estante.html         # Estante — todos os livros
├── historico.html       # Histórico ano a ano
├── desafio.html         # Desafio Livros pelo Mundo
├── 2026.html            # Leituras do ano corrente
├── sobre.html           # Sobre a autora e o projeto
├── data/                # Snapshots gerados automaticamente via GitHub Actions
└── .github/workflows/   # Pipelines de atualização de dados
```

## Autoria

Criado e mantido por **[Louise Victoria](https://vesiuol.github.io/vesiuol/sobre.html)** — jornalista e entusiasta de dados.

## Licença

Este projeto está sob a licença MIT — veja o arquivo [LICENSE](./LICENSE) para mais detalhes.
