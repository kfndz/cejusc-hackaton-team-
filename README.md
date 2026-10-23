# Concilia23 — Mesa Inteligente de Triagem

Protótipo funcional para o Desafio 1 do Hackathon Interno STIC/TRT-23 — Seleção Inteligente de Processos para Conciliação.

## Objetivo

Apoiar o CEJUSC na identificação, compreensão e seleção humana de processos para análise conciliatória. O sistema organiza evidências; não decide, não prevê acordo e não encaminha processos automaticamente.

## Fluxo principal

1. Definir um tema ou critérios e executar **Buscar/Analisar processos**.
2. Refinar os resultados pelos filtros da coluna esquerda; a lista é atualizada ao alterar filtros.
3. Conferir os processos compatíveis na coluna central.
4. Abrir um processo para ver seus dados e explicações na coluna direita.
5. Comparar a faixa demonstrativa de afinidade (Alta, Média, Baixa ou Dados insuficientes) e revisar os dados antes de qualquer decisão humana.
6. Usar **Adicionar à pauta** para abrir uma revisão separada do processo, com os dados, os critérios da busca e as evidências registrados no momento da inclusão.
7. Na seção **Pauta**, aprovar ou retirar a aprovação de cada processo e registrar os aprovados como um encaminhamento demonstrativo.
8. Opcionalmente, exportar a pauta local como CSV. A seleção de análise anterior continua disponível como fluxo separado.

## Recursos consolidados

- cabeçalho institucional com a marca da Justiça do Trabalho/CSJT fornecida para o projeto e identificação “Concilia23 · CEJUSC”;
- busca temática com normalização de caixa e acentos;
- critérios combinados por `AND`;
- filtros por afinidade demonstrativa, fase, valor da causa, porte, ramo, tempo de serviço, verbas e unidade;
- contagens de resultados por opção, limpeza separada de filtros detalhados, critérios de conciliação e consulta completa;
- busca com sugestões, temas rápidos e gerenciador de temas;
- gerenciador de temas com transição entre catálogo e formulário de edição;
- criação e edição de tema por nome, assuntos cadastrados, prioridades e termos textuais;
- busca por assuntos, chips removíveis para os assuntos escolhidos, contador de termos e validação;
- retirada de temas e restauração do catálogo, com armazenamento local no navegador;
- layout de triagem em três áreas: filtros, resultados e detalhe do processo;
- separação entre consulta em edição e consulta efetivamente aplicada;
- identificação da origem da correspondência temática (`Cadastro`, `Texto` ou ambos);
- busca temática que também considera prioridades cadastradas e identifica essa origem separadamente;
- destaque do trecho textual quando o texto sustentou a correspondência;
- explicabilidade organizada em fatores descritivos, histórico do reclamado, perfil da empresa/contrato, referências semelhantes e assuntos/prioridades cadastrados;
- leitura expansível da petição inicial simulada;
- tratamento explícito de informações ausentes (`null` não é `false`);
- seleção humana preservada entre consultas durante a sessão;
- descarte temporário de processos com ação para reincluí-los;
- inclusão rápida de processo na pauta pelo botão “+” no cartão, além da ação no painel de detalhes; o cartão indica quando já está na pauta;
- revisão com remoção individual diretamente na seleção da tela principal ou na janela de revisão, sem recarregar a página;
- exportação CSV somente dos processos selecionados;
- seção de pauta independente da seleção temporária, com registro local, revisão e aprovação por processo;
- captura dos critérios aplicados no momento em que cada processo entra na pauta;
- registro demonstrativo dos aprovados e trilha local das decisões;
- exportação CSV da pauta com aviso explícito de que não houve transmissão externa;
- ordenação da triagem por faixa demonstrativa (Alta primeiro), sem pontuação ou previsão;
- navegação e cabeçalho inspirados em portais institucionais, com identificação clara do ambiente demonstrativo;
- sidebar de consulta recolhível;
- fonte de dados isolada por `data-adapter.js`.

## Arquivos

- `index.html` — estrutura da aplicação;
- `styles.css` — layout, responsividade e estados visuais;
- `app.js` — pesquisa, explicabilidade, seleção e exportação;
- `data-adapter.js` — contrato da fonte de dados;
- `mock-data.js` — dados inteiramente fictícios usados na demonstração.
- `mock-history.js` — formato demonstrativo preparado para referências históricas fictícias; não conectado a dados do TRT-23.

## Fonte de dados

Por padrão, `mock-data.js` fornece a base fictícia.

Uma fonte alternativa pode ser conectada antes de `data-adapter.js` via:

```js
window.CONCILIA23_DATA_PROVIDER = {
  label: 'Nome da fonte',
  demo: true,
  async loadProcesses() {
    return [];
  }
};
```

O adaptador valida e normaliza os registros antes de entregá-los ao frontend.

## Contrato canônico do registro

Campos utilizados:

- `id`
- `vara`
- `classe`
- `fase`
- `assunto`
- `reclamado` (texto opcional)
- `valor` (`number | null`)
- `texto`
- `temas` (`string[]`)
- `historicoAcordos` (`boolean | null`)
- `recorrenciaReclamado` (`boolean | null`)
- `acordosAnteriores` (`number | null`)
- `porte` (`string | null`)
- `ramo` (`string | null`)
- `tempoServicoMeses` (`number | null`)
- `verbas` (`string[] | null`)
- `dadosAusentes` (`string[]`)
- `prioridades` (`string[]`, opcional)

O catálogo de busca guarda os critérios locais em `concilia23-theme-catalog-v1`. Temas-base podem receber edições de nome, assuntos, prioridades e termos; temas criados são armazenados separadamente. Registros antigos que contenham apenas nome e termos continuam válidos.

`null` representa informação indisponível/insuficiente e não deve ser interpretado como resposta negativa.

## Como executar

Abra `index.html` em um navegador moderno ou execute, na pasta do projeto:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Limitações assumidas

- não há integração com PJe;
- não há transmissão ao CEJUSC: “Registrar aprovados para análise do CEJUSC” altera somente o estado demonstrativo salvo neste navegador;
- não há backend ou autenticação;
- não há modelo de IA ou machine learning;
- não há consulta ao histórico do TRT-23: contagens e referências históricas exibidas são demonstrativas, sem relação com casos reais;
- a base de referências semelhantes usa os campos `id`, `subjects`, `claims`, `phase`, `claimValue`, `agreementValue` e `year` em `mock-history.js`; deve ser substituída por fonte validada antes de qualquer uso operacional;
- fatores de contexto são explicações descritivas, sem peso numérico, classificação preditiva ou recomendação;
- a leitura da petição inicial é simulada e usa somente texto fictício de demonstração;
- itens e decisões da pauta podem ser persistidos em `localStorage` deste navegador; não constituem protocolo, processo administrativo nem trilha de auditoria oficial;
- as faixas demonstrativas de afinidade são regras transparentes baseadas somente nos campos fictícios de histórico de acordos e recorrência: ambos positivos = Alta, um positivo = Média, ambos negativos = Baixa e qualquer dado ausente = Dados insuficientes;
- essas faixas não são probabilidade, pontuação numérica, previsão nem recomendação de acordo;
- a regra aproximada para “assédio moral” é apenas demonstrativa e é sinalizada como tal;
- os dados atuais são inteiramente fictícios.
