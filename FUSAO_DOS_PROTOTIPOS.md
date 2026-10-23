# Fusão dos protótipos — Concilia23

Esta versão usa o frontend `cejusc-hackathon-frontend` como base de experiência e incorpora funções selecionadas do `hackathon2026` sem adotar seu motor de score/afinidade.

## Incorporado

1. **Temas rápidos** — atalhos derivados da base carregada.
2. **Origem da correspondência temática** — indica `Cadastro`, `Texto` ou ambos.
3. **Evidência textual destacada** — o drawer destaca os termos/sinais usados quando a correspondência veio do texto.
4. **Consulta aplicada separada da consulta em edição** — editar filtros não altera retroativamente resultados e explicações.
5. **Revisão operacional da seleção** — lista selecionados, permite remover individualmente e mantém contexto da consulta usada na seleção.
6. **Exportação CSV** — exporta somente os selecionados e registra a consulta usada em cada seleção.
7. **Rastreabilidade local da seleção** — cada item selecionado mantém, durante a sessão, a consulta e o horário de seleção.

## Preservado do frontend-base

- busca temática;
- filtros por Vara e fase;
- critérios combinados por `AND`;
- `data-adapter.js` e contrato de fonte de dados;
- distinção entre `null`, `false` e `0`;
- sidebar recolhível;
- `Por que apareceu?`;
- seleção humana;
- dados inteiramente fictícios;
- ausência de probabilidades/scores.

## Não incorporado nesta versão

- índice de afinidade 0–100;
- pesos heurísticos;
- slider tema × conciliação;
- base histórica real;
- chave de pseudonimização;
- analytics;
- gerenciamento de temas;
- casos análogos;
- critérios personalizados;
- integração com PJe.

Esses itens foram mantidos fora do MVP para preservar clareza, auditabilidade e aderência ao escopo do desafio.

## Validação executada

- `node --check app.js`
- `node --check data-adapter.js`
- validação dos IDs essenciais do HTML;
- cenários de lógica:
  - tema `assédio moral` → 3 resultados;
  - `assédio moral` + histórico → 2;
  - `assédio moral` + histórico + recorrência → 1;
  - `horas extras` → 1;
  - tema inexistente → 0;
  - origem temática `Cadastro + Texto` validada;
  - regra aproximada da demonstração identificada separadamente.

A automação visual com Chromium não pôde ser executada neste ambiente por bloqueio administrativo de navegação do navegador headless. Recomenda-se uma conferência visual final no Chrome/Edge antes da apresentação.
