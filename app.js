let processos = [];
let currentResults = [];
let appliedFilters = null;
let dataSource = { label: 'Fonte de dados', demo: true };
let dataLoaded = false;
const selected = new Set();
const selectedContext = new Map();
const discarded = new Set();
const agenda = new Map();
const agendaLog = [];
const activeFilters = {
  affinity: new Set(), phases: new Set(), values: new Set(), sizes: new Set(), sectors: new Set(),
  tenure: new Set(), claims: new Set(), units: new Set()
};
let themeConfig = { removed: [], edited: {}, custom: [] };
let themeCatalog = [];
let themeEditorView = 'list';
let themeEditorId = null;
let themeEditorDraft = null;
let themeSubjectSearch = '';
let themeManagerOpener = null;
let detailId = null;
let themeConfigWarning = '';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

const criterioLabelMap = {
  historicoAcordos: 'Histórico de acordos',
  recorrenciaReclamado: 'Recorrência do reclamado',
  valorModerado: 'Valor da causa até R$ 50 mil',
  faseConhecimento: 'Fase de conhecimento'
};

const els = {
  tema: $('#tema'),
  btnPesquisar: $('#btn-pesquisar'), btnSearchTheme: $('#btn-buscar-tema'), btnLimpar: $('#btn-limpar'), btnNewQuery: $('#btn-new-query'), btnEmptyFocus: $('#btn-empty-focus'),
  btnToggleQuery: $('#btn-toggle-query'), querySidebar: $('#query-sidebar'), quickThemeList: $('#quick-theme-list'),
  advancedFilters: $('#advanced-filters'), activeFilterCount: $('#active-filter-count'), btnClearFilters: $('#btn-clear-filters'),
  btnClearCriteria: $('#btn-clear-criteria'),
  discardedControls: $('#discarded-controls'), discardedCount: $('#discarded-count'), btnRestoreDiscarded: $('#btn-restore-discarded'),
  btnManageThemes: $('#btn-manage-themes'), themeDialog: $('#theme-dialog'), themeDialogContent: $('#theme-dialog-content'),
  dataSourceTitle: $('#data-source-title'), dataSourceLabel: $('#data-source-label'), dataSourceStatus: $('#data-source-status'),
  criteriaText: $('#criteria-text'), activeQueryChips: $('#active-query-chips'), resultCount: $('#result-count'), selectedInline: $('#selected-inline'),
  resultsGrid: $('#results-grid'), emptyState: $('#empty-state'), status: $('#status-message'),
  selectedCountBar: $('#selected-count-bar'), selectionDock: $('#selection-dock'), selectedMiniList: $('#selected-mini-list'),
  btnClearSelected: $('#btn-clear-selected'), btnReviewSelected: $('#btn-review-selected'), btnExportSelected: $('#btn-export-selected'),
  detailPanel: $('#detail-panel'), detailContent: $('#detail-content'), btnCloseDetail: $('#btn-close-detail'), drawerBackdrop: $('#drawer-backdrop'),
  selectionDialog: $('#selection-dialog'), selectionReviewList: $('#selection-review-list'), btnCloseSelection: $('#btn-close-selection'),
  aboutDialog: $('#about-dialog'), btnAbout: $('#btn-about'), toast: $('#toast')
};
const agendaEls = {
  view: $('#pauta-view'), list: $('#agenda-list'), empty: $('#agenda-empty'), log: $('#agenda-log'),
  count: $('#agenda-count'), reviewCount: $('#agenda-review-count'), approvedCount: $('#agenda-approved-count'),
  sentCount: $('#agenda-sent-count'), confirm: $('#btn-confirm-agenda'), clear: $('#btn-clear-agenda'),
  export: $('#btn-export-agenda')
};

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function formatBRL(value) {
  if (value == null) return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function criterioLabel(key) { return criterioLabelMap[key] || key; }
function cloneFilters(f) {
  const advanced = FILTER_KEYS.reduce((snapshot, key) => {
    snapshot[key] = [...activeFilters[key]];
    return snapshot;
  }, {});
  return { temaRaw: f.temaRaw, tema: f.tema, vara: '', fase: '', criterios: [...f.criterios], advanced };
}
function filterSignature(f) { return JSON.stringify({ tema: f?.tema || '', criterios: [...(f?.criterios || [])].sort() }); }

function buildThemeCatalog() {
  const labels = [...new Set(processos.flatMap(p => p.temas || []).map(t => t.trim()).filter(Boolean))];
  const defaults = labels.map(label => {
    const related = processos.filter(processo => (processo.temas || []).some(theme => normalizeText(theme) === normalizeText(label)));
    return {
      id: `base:${normalizeText(label)}`,
      label,
      terms: [label],
      subjects: [...new Set(related.map(processo => processo.assunto).filter(Boolean))],
      priorities: [...new Set(related.flatMap(processo => processo.prioridades || []))],
      custom: false
    };
  });
  const removed = new Set(themeConfig.removed || []);
  const edited = themeConfig.edited || {};
  themeCatalog = defaults
    .filter(theme => !removed.has(theme.id))
    .map(theme => ({ ...theme, ...(edited[theme.id] || {}) }))
    .concat((themeConfig.custom || []).map(theme => ({ ...theme, custom: true })));
}

function renderQuickThemes() {
  const preferred = ['assédio moral', 'horas extras', 'acidente de trabalho', 'verbas rescisórias', 'fgts', 'insalubridade'];
  const ordered = [
    ...preferred.map(label => themeCatalog.find(t => normalizeText(t.label) === normalizeText(label))).filter(Boolean),
    ...themeCatalog.filter(theme => theme.custom && !preferred.includes(normalizeText(theme.label))).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    ...themeCatalog.filter(theme => !theme.custom && !preferred.includes(normalizeText(theme.label))).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  ].slice(0, 8);
  els.quickThemeList.innerHTML = ordered.map(theme => `<button type="button" class="quick-theme" data-theme="${escapeHTML(theme.label)}">${escapeHTML(theme.label)}</button>`).join('');
  $$('.quick-theme', els.quickThemeList).forEach(btn => btn.addEventListener('click', () => {
    els.tema.value = btn.dataset.theme;
    pesquisar();
  }));
  $('#theme-suggestions').innerHTML = themeCatalog.map(theme => `<option value="${escapeHTML(theme.label)}"></option>`).join('');
}

function loadThemeConfig() {
  let raw;
  try {
    raw = localStorage.getItem('concilia23-theme-catalog-v1');
  } catch (error) {
    console.error('Não foi possível acessar as personalizações locais de temas.', error);
    themeConfigWarning = 'Os temas personalizados estarão disponíveis nesta sessão, mas o navegador não permite armazenar as alterações.';
    return;
  }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    const validThemeData = theme => theme && typeof theme.label === 'string'
      && Array.isArray(theme.terms) && theme.terms.every(term => typeof term === 'string')
      && (theme.subjects === undefined || (Array.isArray(theme.subjects) && theme.subjects.every(subject => typeof subject === 'string')))
      && (theme.priorities === undefined || (Array.isArray(theme.priorities) && theme.priorities.every(priority => typeof priority === 'string')));
    const validEdited = saved?.edited && typeof saved.edited === 'object' && !Array.isArray(saved.edited)
      && Object.values(saved.edited).every(validThemeData);
    const validCustom = Array.isArray(saved?.custom) && saved.custom.every(theme =>
      typeof theme?.id === 'string' && validThemeData(theme));
    if (!saved || !Array.isArray(saved.removed) || !saved.removed.every(id => typeof id === 'string') || !validEdited || !validCustom) {
      throw new Error('Formato de catálogo personalizado inválido.');
    }
    themeConfig = saved;
  } catch (error) {
    console.error('Não foi possível carregar o catálogo personalizado de temas.', error);
    themeConfigWarning = 'As personalizações salvas não puderam ser lidas. Use “Restaurar catálogo original” no gerenciamento de temas.';
    themeConfig = { removed: [], edited: {}, custom: [] };
  }
}

function saveThemeConfig() {
  try {
    localStorage.setItem('concilia23-theme-catalog-v1', JSON.stringify(themeConfig));
  } catch (error) {
    console.error('Não foi possível salvar o catálogo de temas neste navegador.', error);
    const errorBox = $('#theme-error');
    if (errorBox) errorBox.textContent = 'Não foi possível salvar. Verifique as permissões de armazenamento do navegador.';
    return false;
  }
  return true;
}

function knownThemeSubjects() {
  return [...new Set(processos.map(processo => processo.assunto.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function knownThemePriorities() {
  return [...new Set(processos.flatMap(processo => processo.prioridades || []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function themeCriteriaSummary(theme) {
  const parts = [];
  if (theme.subjects?.length) parts.push(`${theme.subjects.length} assunto(s)`);
  if (theme.priorities?.length) parts.push(`${theme.priorities.length} prioridade(s)`);
  if (theme.terms?.length) parts.push(`${theme.terms.length} termo(s)`);
  return parts.join(' · ') || 'Sem critérios associados';
}

function renderThemeSubjectOptions() {
  const root = $('#theme-subject-options');
  if (!root || !themeEditorDraft) return;
  const query = normalizeText(themeSubjectSearch);
  const all = knownThemeSubjects();
  const matching = all.filter(subject => normalizeText(subject).includes(query));
  root.innerHTML = matching.length
    ? matching.map(subject => `<label class="theme-choice"><input type="checkbox" data-theme-subject value="${escapeHTML(subject)}"${themeEditorDraft.subjects.includes(subject) ? ' checked' : ''}><span>${escapeHTML(subject)}</span></label>`).join('')
    : '<p class="theme-choice-empty">Nenhum assunto corresponde à busca.</p>';
  const selected = $('#theme-selected-subjects');
  selected.innerHTML = themeEditorDraft.subjects.length
    ? themeEditorDraft.subjects.map(subject => `<span class="theme-selected-chip">${escapeHTML(subject)}<button type="button" data-theme-remove-subject="${escapeHTML(subject)}" aria-label="Remover assunto ${escapeHTML(subject)}">×</button></span>`).join('')
    : '<span class="theme-choice-empty">Nenhum assunto selecionado.</span>';
}

function renderThemeManager() {
  const themes = themeCatalog.slice().sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const list = themes.map(theme => `<li class="theme-manager-item">
    <div class="theme-manager-summary"><strong>${escapeHTML(theme.label)}</strong>
      <span class="theme-origin ${theme.custom ? 'custom' : ''}">${theme.custom ? 'Personalizado' : themeConfig.edited[theme.id] ? 'Padrão editado' : 'Padrão'}</span>
      <small>${escapeHTML(themeCriteriaSummary(theme))}</small></div>
    <div class="theme-manager-actions">
      <button type="button" class="theme-edit-link" data-theme-action="edit" data-id="${escapeHTML(theme.id)}">Editar</button>
      <button type="button" class="theme-remove-link" data-theme-action="remove" data-id="${escapeHTML(theme.id)}">Retirar</button>
    </div>
  </li>`).join('');
  const form = themeEditorView === 'form' ? `
    <form id="theme-form" class="theme-form" novalidate>
      <header class="theme-form-header">
        <div>
          <button type="button" class="theme-back-link" data-theme-action="back">‹ Voltar aos temas</button>
          <h2 id="theme-dialog-title">${themeEditorId ? 'Editar tema' : 'Novo tema'}</h2>
          <p>Configure o nome, os assuntos, as prioridades e os termos usados para localizar processos.</p>
        </div>
        <button type="button" class="dialog-close" data-theme-action="close" aria-label="Fechar edição de tema">×</button>
      </header>
      <div class="theme-form-field">
        <label for="theme-name">Nome do tema</label>
        <input id="theme-name" name="name" type="text" maxlength="60" autocomplete="off" value="${escapeHTML(themeEditorDraft.label)}" placeholder="Ex.: Assédio moral">
        <small>Aparece como atalho na busca. Use de 2 a 60 caracteres.</small>
      </div>
      <fieldset class="theme-form-field">
        <legend>Assuntos cadastrados</legend>
        <small>Processos com esses assuntos no cadastro também serão encontrados pelo tema.</small>
        <div id="theme-selected-subjects" class="theme-selected-subjects"></div>
        <input id="theme-subject-search" type="search" autocomplete="off" value="${escapeHTML(themeSubjectSearch)}" placeholder="Buscar assunto pelo nome">
        <div id="theme-subject-options" class="theme-choice-list" role="group" aria-label="Assuntos cadastrados"></div>
      </fieldset>
      <fieldset class="theme-form-field">
        <legend>Prioridades</legend>
        <small>Processos com estas prioridades cadastradas também serão encontrados.</small>
        <div class="theme-priority-list">${knownThemePriorities().length
          ? knownThemePriorities().map(priority => `<label class="theme-choice"><input type="checkbox" data-theme-priority value="${escapeHTML(priority)}"${themeEditorDraft.priorities.includes(priority) ? ' checked' : ''}><span>${escapeHTML(priority)}</span></label>`).join('')
          : '<p class="theme-choice-empty">A fonte atual não contém prioridades cadastradas.</p>'}</div>
      </fieldset>
      <div class="theme-form-field">
        <label for="theme-terms">Termos buscados no texto da petição</label>
        <small>Um termo por linha ou separados por vírgula. A leitura do texto é simulada neste protótipo.</small>
        <textarea id="theme-terms" rows="6" placeholder="Ex.: assédio moral&#10;humilhação&#10;constrangimento">${escapeHTML(themeEditorDraft.terms)}</textarea>
        <small id="theme-term-count" aria-live="polite"></small>
      </div>
      <div id="theme-error" class="theme-error" role="alert"></div>
      <footer class="theme-form-actions">
        <button type="submit" class="theme-save-button">✓ Salvar tema</button>
        <button type="button" class="theme-cancel-button" data-theme-action="back">Cancelar</button>
      </footer>
    </form>` : `
    <div class="theme-manager-header">
      <div><span class="dialog-kicker">Catálogo de busca</span><h2 id="theme-dialog-title">Gerenciar temas</h2>
        <p>Os temas ativos aparecem na busca. Edite os critérios, crie atalhos ou retire temas que não utiliza.</p></div>
      <button id="btn-close-themes" class="dialog-close" type="button" data-theme-action="close" aria-label="Fechar gerenciamento de temas">×</button>
    </div>
    <div class="theme-list-toolbar"><button type="button" class="theme-save-button" data-theme-action="new">＋ Novo tema</button><span>${themes.length} tema(s) ativo(s)</span></div>
    <ul class="theme-manager-list">${list || '<li class="theme-list-empty">Nenhum tema ativo. Crie um novo ou restaure o catálogo original.</li>'}</ul>
    <footer class="theme-manager-footer"><button type="button" class="theme-restore-link" data-theme-action="restore">Restaurar catálogo original</button><p>As alterações ficam salvas somente neste navegador.</p></footer>`;
  els.themeDialogContent.innerHTML = themeEditorView === 'form'
    ? `<div class="theme-editor-screen" aria-labelledby="theme-dialog-title">${form}</div>`
    : `<div class="theme-list-screen">${form}</div>`;
  if (themeEditorView === 'form') {
    renderThemeSubjectOptions();
    updateThemeTermCount();
    $('#theme-name').focus();
  }
}

function openThemeManager() {
  themeManagerOpener = document.activeElement;
  themeEditorView = 'list';
  themeEditorId = null;
  themeEditorDraft = null;
  renderThemeManager();
  els.themeDialog.showModal();
}

function openThemeEditor(id = '') {
  const theme = id ? themeCatalog.find(item => item.id === id) : null;
  if (id && !theme) return;
  themeEditorId = theme?.id || null;
  themeEditorDraft = {
    label: theme?.label || '',
    subjects: [...(theme?.subjects || [])],
    priorities: [...(theme?.priorities || [])],
    terms: (theme?.terms || []).join('\n')
  };
  themeSubjectSearch = '';
  themeEditorView = 'form';
  renderThemeManager();
}

function updateThemeTermCount() {
  const counter = $('#theme-term-count');
  const terms = [...new Set($('#theme-terms').value.split(/[,;\n\r]+/).map(term => term.trim()).filter(Boolean))];
  counter.textContent = `${terms.length} termo(s) (máximo 30)`;
  counter.classList.toggle('theme-term-limit', terms.length > 30);
}

function saveTheme() {
  const id = themeEditorId;
  const previousTheme = themeCatalog.find(theme => theme.id === id);
  const label = $('#theme-name').value.trim().replace(/\s+/g, ' ');
  const terms = [...new Set($('#theme-terms').value.split(/[,;\n\r]+/).map(term => term.trim()).filter(Boolean))];
  const duplicate = themeCatalog.find(theme => theme.id !== id && normalizeText(theme.label) === normalizeText(label));
  const errors = [];
  if (label.length < 2 || label.length > 60) errors.push('O nome do tema deve ter entre 2 e 60 caracteres.');
  if (duplicate) errors.push('Já existe um tema com esse nome.');
  if (terms.length > 30) errors.push('O tema pode ter no máximo 30 termos de busca.');
  if (terms.some(term => term.length > 40)) errors.push('Cada termo de busca deve ter até 40 caracteres.');
  if (!themeEditorDraft.subjects.length && !themeEditorDraft.priorities.length && !terms.length) {
    errors.push('Associe ao menos um assunto, uma prioridade ou um termo de busca.');
  }
  if (errors.length) {
    $('#theme-error').innerHTML = `<ul>${errors.map(error => `<li>${escapeHTML(error)}</li>`).join('')}</ul>`;
    return;
  }
  const theme = {
    id: id || `custom:${Date.now().toString(36)}`,
    label,
    terms,
    subjects: [...themeEditorDraft.subjects],
    priorities: [...themeEditorDraft.priorities],
    custom: !id
  };
  if (id?.startsWith('base:')) {
    themeConfig.edited[id] = { label, terms, subjects: theme.subjects, priorities: theme.priorities };
  } else if (id) {
    themeConfig.custom = themeConfig.custom.map(item => item.id === id ? theme : item);
  } else {
    themeConfig.custom.push(theme);
  }
  if (!saveThemeConfig()) return;
  buildThemeCatalog();
  renderQuickThemes();
  syncAppliedTheme(previousTheme, themeCatalog.find(item => item.id === theme.id));
  themeEditorView = 'list';
  themeEditorDraft = null;
  renderThemeManager();
  showToast(`Tema “${label}” salvo neste navegador.`);
}

function removeTheme(id) {
  const theme = themeCatalog.find(item => item.id === id);
  if (!theme || !window.confirm(`Retirar “${theme.label}” do catálogo de busca?`)) return;
  if (id.startsWith('base:')) {
    if (!themeConfig.removed.includes(id)) themeConfig.removed.push(id);
    delete themeConfig.edited[id];
  } else {
    themeConfig.custom = themeConfig.custom.filter(item => item.id !== id);
  }
  if (!saveThemeConfig()) return;
  buildThemeCatalog();
  renderQuickThemes();
  syncAppliedTheme(theme, null);
  renderThemeManager();
  showToast(`Tema “${theme.label}” retirado do catálogo.`);
}

function restoreThemes() {
  const previousTheme = themeCatalog.find(theme => appliedFilters?.tema === normalizeText(theme.label));
  if (!window.confirm('Restaurar o catálogo original? As personalizações serão removidas.')) return;
  themeConfig = { removed: [], edited: {}, custom: [] };
  if (!saveThemeConfig()) return;
  buildThemeCatalog();
  renderQuickThemes();
  if (previousTheme && !themeCatalog.some(theme => normalizeText(theme.label) === normalizeText(previousTheme.label))) {
    syncAppliedTheme(previousTheme, null);
  }
  themeEditorView = 'list';
  renderThemeManager();
  showToast('Catálogo de temas restaurado.');
}

function syncAppliedTheme(previousTheme, nextTheme) {
  if (!previousTheme || !appliedFilters || appliedFilters.tema !== normalizeText(previousTheme.label)) return;
  if (nextTheme) {
    appliedFilters.temaRaw = nextTheme.label;
    appliedFilters.tema = normalizeText(nextTheme.label);
    els.tema.value = nextTheme.label;
  } else {
    appliedFilters.temaRaw = '';
    appliedFilters.tema = '';
    els.tema.value = '';
  }
  refreshAppliedResults();
}

function getFiltros() {
  return {
    temaRaw: els.tema.value.trim(),
    tema: normalizeText(els.tema.value),
    criterios: $$('.criterio:checked').map(el => el.value)
  };
}

function temaMatch(processo, tema) {
  if (!tema) return { ok: true, motivo: 'sem tema informado', sources: [], textual: false, cadastro: false, approximate: false, terms: [] };

  const assunto = normalizeText(processo.assunto);
  const texto = normalizeText(processo.texto);
  const temas = (processo.temas || []).map(normalizeText);
  const matchingDefinition = themeCatalog.find(item => normalizeText(item.label) === tema);
  const cadastroTerms = matchingDefinition ? [matchingDefinition.label, ...matchingDefinition.terms].map(normalizeText) : [tema];
  const assuntoMatch = cadastroTerms.some(term => assunto.includes(term) || term.includes(assunto));
  const temasMatch = temas.some(t => cadastroTerms.some(term => t.includes(term) || term.includes(t)));
  const matchingSubjects = matchingDefinition?.subjects?.some(subject => normalizeText(subject) === assunto) || false;
  const matchingPriorities = (processo.prioridades || []).filter(priority =>
    (matchingDefinition?.priorities || []).some(selected => normalizeText(selected) === normalizeText(priority)));
  const searchTerms = matchingDefinition ? matchingDefinition.terms : [tema];
  const textHits = searchTerms.map(normalizeText).filter(term => term && texto.includes(term));
  const textExact = textHits.length > 0;
  let approximate = false;
  let approximateTerms = [];

  if (dataSource.demo && tema.includes('assedio moral') && !textExact) {
    const sinais = ['humilha', 'constrang', 'exposicao', 'isolamento', 'cobrancas reiteradas'];
    approximateTerms = sinais.filter(s => texto.includes(s));
    approximate = approximateTerms.length > 0;
  }

  const cadastro = assuntoMatch || temasMatch || matchingSubjects;
  const priorityMatch = matchingPriorities.length > 0;
  const textual = textExact || approximate;
  const sources = [];
  if (cadastro) sources.push('Cadastro');
  if (priorityMatch) sources.push('Prioridade cadastrada');
  if (textual) sources.push('Texto');
  if (!sources.length) return { ok: false, motivo: 'tema não identificado', sources: [], textual: false, cadastro: false, approximate: false, terms: [] };

  let motivo = '';
  if ((cadastro || priorityMatch) && textual) motivo = approximate ? 'tema localizado em cadastro/prioridade e por sinais textuais aproximados' : 'tema localizado em cadastro/prioridade e no texto';
  else if (cadastro && priorityMatch) motivo = 'tema localizado no assunto/temas e em prioridade cadastrada';
  else if (priorityMatch) motivo = 'tema associado a uma prioridade cadastrada';
  else if (cadastro) motivo = assuntoMatch ? 'assunto cadastrado compatível' : 'tema associado ao registro consultado';
  else motivo = approximate ? 'trecho textual com sinais relacionados ao tema pesquisado' : 'expressão localizada no texto do registro';

  const queryTerms = matchingDefinition ? matchingDefinition.terms : normalizeText(tema).split(/\s+/).filter(t => t.length >= 3);
  return { ok: true, motivo, sources, textual, cadastro: cadastro || priorityMatch, priorityMatch, priorities: matchingPriorities, approximate, terms: approximate ? approximateTerms : (textHits.length ? textHits : queryTerms) };
}

function criterioMatch(processo, criterio) {
  switch (criterio) {
    case 'historicoAcordos': return processo.historicoAcordos === true;
    case 'recorrenciaReclamado': return processo.recorrenciaReclamado === true;
    case 'valorModerado': return processo.valor != null && processo.valor <= 50000;
    case 'faseConhecimento': return processo.fase === 'Conhecimento';
    default: return false;
  }
}

function processMatches(processo, filtros) {
  const anyInput = Boolean(filtros.tema || filtros.criterios.length || hasAdvancedFilters());
  if (!anyInput) return false;
  return (!filtros.tema || temaMatch(processo, filtros.tema).ok)
    && filtros.criterios.every(c => criterioMatch(processo, c));
}

function getMatchedCriteria(processo, filtros) {
  return filtros.criterios.filter(c => criterioMatch(processo, c));
}

function getAppliedEvidence(processo, filtros) {
  const evidence = [];
  if (filtros.tema) {
    const theme = temaMatch(processo, filtros.tema);
    if (theme.ok) evidence.push({
      type: 'theme',
      title: `Tema “${filtros.temaRaw}”`,
      detail: `${theme.motivo}. Origem: ${theme.sources.join(' + ')}.`,
      sources: theme.sources
    });
  }
  filtros.criterios.forEach(c => {
    if (!criterioMatch(processo, c)) return;
    if (c === 'historicoAcordos') evidence.push({ type: 'signal', title: 'Histórico de acordos', detail: processo.acordosAnteriores == null ? 'Há registro de acordo anterior na fonte consultada.' : `${processo.acordosAnteriores} acordo(s) anterior(es) registrado(s) na fonte consultada.` });
    if (c === 'recorrenciaReclamado') evidence.push({ type: 'signal', title: 'Recorrência do reclamado', detail: 'O mesmo reclamado aparece em outros acordos da fonte consultada.' });
    if (c === 'valorModerado') evidence.push({ type: 'signal', title: 'Valor da causa até R$ 50 mil', detail: `O valor da causa (${formatBRL(processo.valor)}) está dentro da faixa selecionada.` });
    if (c === 'faseConhecimento') evidence.push({ type: 'signal', title: 'Fase de conhecimento', detail: 'O registro informa que o processo está na fase de conhecimento.' });
  });
  FILTER_KEYS.forEach(key => {
    const selectedValues = filtros.advanced?.[key] || [...activeFilters[key]];
    if (!selectedValues.length) return;
    const matches = [].concat(filterValue(key, processo) || []).filter(value => selectedValues.includes(value));
    if (matches.length) evidence.push({
      type: 'filter',
      title: FILTER_TITLES[key],
      detail: `Corresponde ao filtro aplicado: ${matches.map(value => filterOptionLabel(key, value)).join(', ')}.`
    });
  });
  return evidence;
}

function affinityExplanation(processo) {
  if (processo.historicoAcordos == null || processo.recorrenciaReclamado == null) {
    return ['Não há informação suficiente sobre histórico e recorrência para formar uma faixa demonstrativa.'];
  }
  if (processo.historicoAcordos && processo.recorrenciaReclamado) {
    return ['Há registro de acordos anteriores na fonte consultada.', 'Há registro de recorrência do reclamado na fonte consultada.'];
  }
  if (processo.historicoAcordos) return ['Há registro de acordos anteriores; não há registro de recorrência na fonte consultada.'];
  if (processo.recorrenciaReclamado) return ['Há registro de recorrência; não há histórico de acordos informado como positivo na fonte consultada.'];
  return ['A fonte consultada não registra histórico de acordos nem recorrência para este registro. Isso não indica recusa à conciliação.'];
}

function renderDraftQuery() {
  const f = getFiltros();
  const chips = [];
  if (f.temaRaw) chips.push(`<span class="query-chip theme">${escapeHTML(f.temaRaw)}</span>`);
  f.criterios.forEach(c => chips.push(`<span class="query-chip signal">${escapeHTML(criterioLabel(c))}</span>`));
  els.activeQueryChips.innerHTML = chips.length ? chips.join('') : '<span class="query-placeholder">Nenhum critério definido</span>';
}

function describeFilters(f) {
  if (!f) return 'Nenhum critério informado';
  const text = [];
  if (f.temaRaw) text.push(`Tema: ${f.temaRaw}`);
  if (f.criterios.length) text.push(f.criterios.map(criterioLabel).join(' + '));
  const active = describeActiveFilters(f.advanced);
  if (active) text.push(active);
  return text.length ? text.join(' · ') : 'Nenhum critério informado';
}

const FILTER_KEYS = ['affinity', 'phases', 'values', 'sizes', 'sectors', 'tenure', 'claims', 'units'];
const FILTER_TITLES = {
  affinity: 'Afinidade conciliatória', phases: 'Fase', values: 'Valor da causa', sizes: 'Porte da empresa',
  sectors: 'Ramo empresarial', tenure: 'Tempo de serviço', claims: 'Verbas pleiteadas', units: 'Unidade'
};

function hasAdvancedFilters() { return FILTER_KEYS.some(key => activeFilters[key].size > 0); }

function affinityFor(processo) {
  const facts = [processo.historicoAcordos, processo.recorrenciaReclamado];
  if (facts.some(value => value == null)) return 'insufficient';
  if (facts.every(Boolean)) return 'high';
  if (facts.some(Boolean)) return 'medium';
  return 'low';
}

function affinityLabel(value) {
  return ({ high: 'Alta', medium: 'Média', low: 'Baixa', insufficient: 'Dados insuficientes' })[value] || 'Não classificada';
}

function getTenureBand(months) {
  if (months == null) return 'insufficient';
  if (months < 12) return 'under1';
  if (months < 36) return '1to3';
  if (months < 60) return '3to5';
  return 'over5';
}

function getValueBand(value) {
  if (value == null) return 'insufficient';
  if (value <= 10000) return 'to10';
  if (value <= 30000) return '10to30';
  if (value <= 60000) return '30to60';
  if (value <= 100000) return '60to100';
  return 'over100';
}

function filterOptions(key, list = currentResults) {
  const unique = values => [...new Set(values.filter(value => value != null && value !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
  const withMissing = (values, hasMissing) => hasMissing ? values.concat([['__missing__', 'Não informado']]) : values;
  if (key === 'affinity') return [
    ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa'], ['insufficient', 'Dados insuficientes']
  ];
  if (key === 'phases') return unique(list.map(p => p.fase)).map(value => [value, value]);
  if (key === 'values') return [
    ['to10', 'Até R$ 10 mil'], ['10to30', 'Mais de R$ 10 mil até R$ 30 mil'], ['30to60', 'Mais de R$ 30 mil até R$ 60 mil'],
    ['60to100', 'Mais de R$ 60 mil até R$ 100 mil'], ['over100', 'Acima de R$ 100 mil'], ['insufficient', 'Não informado']
  ];
  if (key === 'sizes') return withMissing(unique(list.map(p => p.porte)).map(value => [value, value]), list.some(p => p.porte == null));
  if (key === 'sectors') return withMissing(unique(list.map(p => p.ramo)).map(value => [value, value]), list.some(p => p.ramo == null));
  if (key === 'tenure') return [
    ['under1', 'Menos de 1 ano'], ['1to3', 'De 1 a 3 anos'], ['3to5', 'De 3 a 5 anos'],
    ['over5', 'Mais de 5 anos'], ['insufficient', 'Não informado']
  ];
  if (key === 'claims') return withMissing(unique(list.flatMap(p => p.verbas || [])).map(value => [value, value]), list.some(p => p.verbas == null));
  if (key === 'units') return unique(list.map(p => p.vara)).map(value => [value, value]);
  return [];
}

function filterOptionLabel(key, value) {
  if (key === 'affinity') return affinityLabel(value);
  const option = filterOptions(key, processos).find(([optionValue]) => optionValue === value);
  return option ? option[1] : value;
}

function filterValue(key, processo) {
  switch (key) {
    case 'affinity': return affinityFor(processo);
    case 'phases': return processo.fase;
    case 'values': return getValueBand(processo.valor);
    case 'sizes': return processo.porte == null ? '__missing__' : processo.porte;
    case 'sectors': return processo.ramo == null ? '__missing__' : processo.ramo;
    case 'tenure': return getTenureBand(processo.tempoServicoMeses);
    case 'claims': return processo.verbas == null ? ['__missing__'] : processo.verbas;
    case 'units': return processo.vara;
    default: return null;
  }
}

function matchesAdvancedFilters(processo, skipKey = '') {
  return FILTER_KEYS.every(key => {
    const chosen = activeFilters[key];
    if (key === skipKey || !chosen.size) return true;
    const values = [].concat(filterValue(key, processo) || []);
    return values.some(value => chosen.has(value));
  });
}

function getVisibleResults() {
  return currentResults.filter(processo => !discarded.has(processo.id) && matchesAdvancedFilters(processo));
}

function countActiveFilters() {
  return FILTER_KEYS.reduce((count, key) => count + activeFilters[key].size, 0);
}

function describeActiveFilters(snapshot = null) {
  const filters = snapshot || activeFilters;
  return FILTER_KEYS.map(key => {
    const selectedValues = filters[key] || [];
    if (!selectedValues.length) return '';
    const labels = selectedValues.map(value => filterOptionLabel(key, value));
    return `${FILTER_TITLES[key]}: ${labels.join(', ')}`;
  }).filter(Boolean).join('; ');
}

function renderAdvancedFilters() {
  const source = (appliedFilters ? currentResults : processos).filter(processo => !discarded.has(processo.id));
  els.advancedFilters.innerHTML = FILTER_KEYS.map(key => {
    const options = filterOptions(key, source);
    if (!options.length) return '';
    const counts = new Map();
    source.filter(processo => matchesAdvancedFilters(processo, key)).forEach(processo => {
      [].concat(filterValue(key, processo) || []).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    });
    return `<fieldset class="advanced-filter-group"><legend>${FILTER_TITLES[key]}</legend>
      ${key === 'affinity' ? '<p class="filter-method-note">Faixas demonstrativas, explicáveis e sem pontuação. Não indicam probabilidade nem recomendação.</p>' : ''}
      ${options.map(([value, label]) => `<label class="advanced-filter-option"><input type="checkbox" data-filter-key="${key}" value="${escapeHTML(value)}" ${activeFilters[key].has(value) ? 'checked' : ''}><span>${escapeHTML(label)}</span><small>${counts.get(value) || 0}</small></label>`).join('')}
    </fieldset>`;
  }).join('');
  els.activeFilterCount.textContent = `${countActiveFilters()} ativo(s)`;
  els.discardedControls.hidden = discarded.size === 0;
  els.discardedCount.textContent = discarded.size;
}

function renderAppliedQuery() {
  els.criteriaText.textContent = describeFilters(appliedFilters);
}

function setStatus(type, title, message) {
  els.status.className = `status-message ${type}`;
  els.status.innerHTML = `<span class="status-icon">${type === 'success' ? '✓' : type === 'warning' || type === 'error' ? '!' : 'i'}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
}

function handleDraftChange() {
  renderDraftQuery();
  if (appliedFilters && filterSignature(getFiltros()) !== filterSignature(appliedFilters)) {
    setStatus('info', 'Alterações ainda não aplicadas', 'Os resultados e as explicações continuam vinculados à última consulta executada. Clique em “Analisar processos” para atualizar.');
  }
}

function pesquisar() {
  if (!dataLoaded) return;
  const draft = getFiltros();
  const anyInput = Boolean(draft.tema || draft.criterios.length || hasAdvancedFilters());
  if (!anyInput) {
    currentResults = [];
    appliedFilters = null;
    renderAppliedQuery();
    renderResultados();
    setStatus('warning', 'Nenhum critério informado', 'Defina um tema, critério ou filtro detalhado.');
    openQuery();
    return;
  }

  appliedFilters = cloneFilters(draft);
  currentResults = processos.filter(p => processMatches(p, appliedFilters));
  detailId = null;
  fecharDetalhes();
  renderAppliedQuery();
  renderResultados();

  if (!getVisibleResults().length) {
    setStatus('warning', 'Nenhum processo encontrado', `A consulta à fonte “${dataSource.label}” não encontrou correspondências. Nenhum resultado foi inventado.`);
  } else {
    const tipo = appliedFilters.tema && appliedFilters.criterios.length ? 'consulta combinada' : appliedFilters.tema ? 'busca temática' : 'seleção por critérios';
    setStatus('success', `${getVisibleResults().length} processo(s) encontrado(s)`, `Resultado da ${tipo}. Confira a origem e as evidências antes de selecionar.`);
  }
}

function renderSourceBadges(theme) {
  if (!theme?.ok || !theme.sources.length) return '';
  return theme.sources.map(source => `<span class="tag tag-source ${source === 'Texto' ? 'textual' : source === 'Prioridade cadastrada' ? 'priority' : 'cadastro'}">${source}</span>`).join('');
}

function renderResultados() {
  els.resultsGrid.innerHTML = '';
  const affinityOrder = { high: 0, medium: 1, low: 2, insufficient: 3 };
  const visibleResults = getVisibleResults().slice().sort((a, b) => affinityOrder[affinityFor(a)] - affinityOrder[affinityFor(b)]);
  els.resultCount.textContent = `${visibleResults.length} processo(s)`;
  els.selectedInline.textContent = `${selected.size} selecionado(s)`;
  const hasAppliedQuery = Boolean(appliedFilters);
  els.emptyState.hidden = visibleResults.length > 0;

  if (!visibleResults.length) {
    $('#empty-state h4').textContent = hasAppliedQuery
      ? (currentResults.length ? 'Nenhum processo corresponde aos filtros' : 'Nenhum processo corresponde à consulta')
      : 'Comece montando uma consulta';
    $('#empty-state p').textContent = hasAppliedQuery
      ? (currentResults.length ? 'Remova ou ajuste filtros para ampliar os resultados.' : `A fonte “${dataSource.label}” não possui correspondências para esta consulta.`)
      : 'Pesquise um tema ou escolha critérios e filtros para ver processos compatíveis.';
  }

  visibleResults.forEach((processo, index) => {
    const f = appliedFilters || { tema: '', temaRaw: '', criterios: [], vara: '', fase: '' };
    const evidence = getAppliedEvidence(processo, f);
    const matched = getMatchedCriteria(processo, f);
    const theme = f.tema ? temaMatch(processo, f.tema) : null;
    const mainReason = evidence.slice(0, 2).map(e => e.title).join(' + ') || 'Filtros estruturais da consulta';
    const affinity = affinityFor(processo);
    const activeFilterTags = FILTER_KEYS.flatMap(key => {
      const values = f.advanced?.[key] || [];
      return values.length ? [`${FILTER_TITLES[key]}: ${values.map(value => filterOptionLabel(key, value)).join(', ')}`] : [];
    });

    const card = document.createElement('article');
    card.tabIndex = 0;
    card.setAttribute('aria-label', `Processo ${processo.id}. Ative para ver os detalhes.`);
    card.className = `result-card${selected.has(processo.id) ? ' selected' : ''}${detailId === processo.id ? ' active' : ''}`;
    const alreadyInAgenda = agenda.has(processo.id);
    card.innerHTML = `
      <div class="card-accent"></div>
      <div class="card-body">
        <div class="card-main">
          <div class="card-index">${String(index + 1).padStart(2,'0')}</div>
          <div class="card-identity">
            <div class="card-process-id">${escapeHTML(processo.id)}</div>
            <div class="card-process-meta">${escapeHTML(processo.vara)} · ${escapeHTML(processo.fase)} · ${escapeHTML(processo.classe)}</div>
            <div class="card-subject">${escapeHTML(processo.assunto)}</div>
          </div>
          <span class="affinity-badge affinity-${affinity}" title="Faixa demonstrativa baseada nos dados disponíveis; não representa probabilidade.">${affinityLabel(affinity)}</span>
        </div>

        <div class="card-match">
          <span class="match-label">Por que entrou nesta consulta</span>
          <strong>${escapeHTML(mainReason)}</strong>
          <div class="card-tags">
            ${f.tema && theme?.ok ? `<span class="tag tag-theme">Tema: ${escapeHTML(f.temaRaw)}</span>${renderSourceBadges(theme)}` : ''}
            ${matched.map(c => `<span class="tag tag-signal">${escapeHTML(criterioLabel(c))}</span>`).join('')}
            ${activeFilterTags.map(label => `<span class="tag tag-filter">${escapeHTML(label)}</span>`).join('')}
            ${processo.dadosAusentes.length ? `<span class="tag tag-missing">Há informação insuficiente</span>` : ''}
          </div>
        </div>

        <button class="explain-btn" type="button" data-id="${escapeHTML(processo.id)}">Detalhar processo <span>→</span></button>
        <button class="agenda-quick-add${alreadyInAgenda ? ' added' : ''}" type="button" data-id="${escapeHTML(processo.id)}"${alreadyInAgenda ? ' disabled aria-label="Processo já adicionado à pauta" title="Processo já adicionado à pauta"' : ` aria-label="Adicionar processo ${escapeHTML(processo.id)} à pauta" title="Adicionar à pauta"`}>
          <span aria-hidden="true">${alreadyInAgenda ? '✓' : '+'}</span>
          <small>${alreadyInAgenda ? 'Na pauta' : 'Pauta'}</small>
        </button>
      </div>`;
    els.resultsGrid.appendChild(card);
    card.addEventListener('click', event => {
      if (!event.target.closest('button')) abrirDetalhes(processo.id);
    });
    card.addEventListener('keydown', event => {
      if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        abrirDetalhes(processo.id);
      }
    });
  });

  $$('.explain-btn', els.resultsGrid).forEach(btn => btn.addEventListener('click', () => abrirDetalhes(btn.dataset.id)));
  $$('.agenda-quick-add:not(:disabled)', els.resultsGrid).forEach(btn => btn.addEventListener('click', () => addToAgenda(btn.dataset.id, false)));
  renderAdvancedFilters();
  if (detailId && visibleResults.some(processo => processo.id === detailId)) abrirDetalhes(detailId);
  else if (detailId) fecharDetalhes();
}

function highlightExcerpt(text, rawTheme, theme) {
  if (!text) return '<span class="no-text-evidence">Nenhum trecho textual disponível.</span>';
  const queryTerms = normalizeText(rawTheme).split(/\s+/).filter(t => t.length >= 3);
  const terms = new Set([...(theme?.terms || []), ...queryTerms].map(normalizeText).filter(Boolean));
  if (!terms.size) return escapeHTML(text);

  return String(text).split(/(\s+)/).map(part => {
    if (/^\s+$/.test(part)) return part;
    const cleaned = normalizeText(part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    const match = cleaned && [...terms].some(term => cleaned.includes(term) || term.includes(cleaned));
    return match ? `<mark>${escapeHTML(part)}</mark>` : escapeHTML(part);
  }).join('');
}

function agreementFactors(processo) {
  const agreements = processo.acordosAnteriores;
  return [
    {
      title: 'Histórico de acordos',
      detail: agreements == null
        ? 'Não informado na fonte demonstrativa.'
        : agreements > 0
          ? `${agreements} acordo(s) anterior(es) informado(s) para o reclamado.`
          : 'Nenhum acordo anterior consta no registro demonstrativo; isso não indica recusa à conciliação.',
      state: agreements == null ? 'missing' : 'context'
    },
    {
      title: 'Recorrência do reclamado',
      detail: processo.recorrenciaReclamado == null
        ? 'Não há informação suficiente na fonte consultada.'
        : processo.recorrenciaReclamado
          ? 'A fonte demonstrativa registra recorrência do reclamado em acordos.'
          : 'A fonte demonstrativa não registra recorrência; isso não representa uma avaliação de disposição para acordo.',
      state: processo.recorrenciaReclamado == null ? 'missing' : 'context'
    },
    {
      title: 'Fase processual',
      detail: processo.fase ? `Fase registrada: ${processo.fase}. Apresentada para contexto, sem atribuição automática de peso.` : 'Fase não informada.',
      state: processo.fase ? 'context' : 'missing'
    },
    {
      title: 'Valor da causa e verbas',
      detail: processo.valor == null
        ? 'Valor da causa não informado; consulte os documentos antes de qualquer análise.'
        : `Valor informado: ${formatBRL(processo.valor)}. Verbas: ${(processo.verbas || []).join(', ') || 'não informadas'}. Não há cálculo de proposta de acordo.`,
      state: processo.valor == null || processo.verbas == null ? 'missing' : 'context'
    }
  ];
}

function similarHistoricalAgreements(processo) {
  const dataset = window.CONCILIA23_HISTORICO_SIMULADO;
  if (!dataset || !Array.isArray(dataset.agreements)) return [];
  const subjects = new Set([...(processo.temas || []), processo.assunto].map(normalizeText).filter(Boolean));
  const claims = new Set((processo.verbas || []).map(normalizeText));
  return dataset.agreements.map(agreement => {
    const commonSubjects = (agreement.subjects || []).filter(subject => subjects.has(normalizeText(subject)));
    const commonClaims = (agreement.claims || []).filter(claim => claims.has(normalizeText(claim)));
    return { agreement, commonSubjects, commonClaims, matches: commonSubjects.length + commonClaims.length };
  }).filter(item => item.matches > 0)
    .sort((a, b) => b.matches - a.matches || b.agreement.year - a.agreement.year)
    .slice(0, 3);
}

function renderAgreementFactors(processo) {
  return `<div class="agreement-factor-list">${agreementFactors(processo).map(factor => `
    <article class="agreement-factor ${factor.state}">
      <span class="factor-state">${factor.state === 'missing' ? 'Não informado' : 'Contexto registrado'}</span>
      <strong>${escapeHTML(factor.title)}</strong>
      <p>${escapeHTML(factor.detail)}</p>
    </article>`).join('')}</div>`;
}

function renderSimilarAgreements(processo) {
  const dataset = window.CONCILIA23_HISTORICO_SIMULADO;
  const similarities = similarHistoricalAgreements(processo);
  const items = similarities.length ? `<ul class="similar-agreement-list">${similarities.map(({ agreement, commonSubjects, commonClaims }) => `
    <li>
      <div class="similar-agreement-heading"><strong>Referência fictícia ${escapeHTML(agreement.id)}</strong><span>${escapeHTML(String(agreement.year))} · ${escapeHTML(agreement.phase)}</span></div>
      <p>Valor da causa: ${formatBRL(agreement.claimValue)} <span aria-hidden="true">·</span> Acordo registrado: ${formatBRL(agreement.agreementValue)}</p>
      <small>Temas em comum: ${escapeHTML([...commonSubjects, ...commonClaims].join(', '))}</small>
    </li>`).join('')}</ul>` : '<p class="drawer-empty">Ainda não há referência semelhante cadastrada para os assuntos e verbas deste processo.</p>';
  return `<section class="drawer-section history-section">
    <div class="drawer-section-title">Acordos semelhantes na base histórica</div>
    <div class="history-source-note"><strong>${escapeHTML(dataset?.label || 'Base histórica não conectada')}</strong><span>${escapeHTML(dataset?.source || 'A estrutura está pronta para receber registros históricos validados.')}</span></div>
    ${items}
    <p class="history-disclaimer">Amostra exclusivamente ilustrativa. Não representa casos nem dados do TRT-23, não estima probabilidade e não sugere valor de acordo.</p>
  </section>`;
}

function renderRespondentHistory(processo) {
  const count = processo.acordosAnteriores;
  const countText = count == null ? 'Não informado' : String(count);
  const recurrenceText = processo.recorrenciaReclamado == null
    ? 'Não informado'
    : processo.recorrenciaReclamado ? 'Registrada na base demonstrativa' : 'Não identificada na base demonstrativa';
  return `<section class="drawer-section history-section">
    <div class="drawer-section-title">Histórico do reclamado no TRT-23</div>
    <div class="history-source-note"><strong>Consulta histórica não conectada</strong><span>Os valores abaixo são demonstrativos e não são registros reais do TRT-23.</span></div>
    <div class="respondent-history-grid">
      <div><span>Acordos anteriores informados</span><strong>${escapeHTML(countText)}</strong></div>
      <div><span>Recorrência</span><strong>${escapeHTML(recurrenceText)}</strong></div>
    </div>
    <p class="history-disclaimer">${count === 0 ? 'Não encontrar acordos na base demonstrativa não significa que não existam acordos ou disposição para conciliar.' : 'Este resumo é descritivo, não avalia mérito e não estima resultado.'}</p>
  </section>`;
}

function toggleSelected(id) {
  if (selected.has(id)) {
    selected.delete(id);
    selectedContext.delete(id);
  } else {
    selected.add(id);
    selectedContext.set(id, { filters: cloneFilters(appliedFilters || getFiltros()), selectedAt: new Date().toISOString() });
  }
  atualizarSelecao();
  renderResultados();
}

function refreshAppliedResults() {
  if (!appliedFilters && hasAdvancedFilters()) {
    appliedFilters = { temaRaw: '', tema: '', vara: '', fase: '', criterios: [] };
    currentResults = processos.slice();
  } else if (appliedFilters) {
    const hasQuery = Boolean(appliedFilters.tema || appliedFilters.criterios.length);
    if (!hasQuery && !hasAdvancedFilters()) {
      appliedFilters = null;
      currentResults = [];
    } else {
      currentResults = processos.filter(processo => processMatches(processo, appliedFilters));
    }
  } else {
    currentResults = [];
  }
  if (appliedFilters) appliedFilters = cloneFilters(appliedFilters);
  renderAppliedQuery();
  renderResultados();
  if (appliedFilters) {
    setStatus(getVisibleResults().length ? 'success' : 'warning',
      getVisibleResults().length ? `${getVisibleResults().length} processo(s) compatível(is)` : 'Nenhum processo corresponde aos filtros',
      'Os filtros atualizam a lista sem alterar a consulta-base aplicada.');
  } else {
    setStatus('info', 'Filtros limpos', 'Escolha um tema, critério ou filtro detalhado para consultar os processos.');
  }
}

function discardProcess(id) {
  const processo = processos.find(item => item.id === id);
  if (agenda.has(id)) {
    showToast('Retire o processo da pauta antes de descartá-lo da triagem.');
    return;
  }
  if (!processo || !window.confirm(`Descartar ${processo.id} desta triagem?`)) return;
  discarded.add(id);
  selected.delete(id);
  selectedContext.delete(id);
  detailId = null;
  fecharDetalhes();
  atualizarSelecao();
  renderResultados();
  showToast('Processo descartado desta triagem.');
}

function restoreDiscarded() {
  discarded.clear();
  refreshAppliedResults();
  showToast('Processos reincluídos na triagem.');
}

function atualizarSelecao() {
  const count = selected.size;
  els.selectedCountBar.textContent = count;
  els.selectedInline.textContent = `${count} selecionado(s)`;
  els.selectionDock.hidden = count === 0;
  els.selectedMiniList.innerHTML = [...selected].map(id =>
    `<button type="button" class="mini-process" data-remove-selected="${escapeHTML(id)}" aria-label="Remover processo ${escapeHTML(id)} da seleção"><span>${escapeHTML(id)}</span><span aria-hidden="true">×</span></button>`
  ).join('');
}

function abrirDetalhes(id, filtrosOverride = null) {
  const processo = processos.find(p => p.id === id);
  if (!processo) return;
  detailId = id;
  const f = filtrosOverride || appliedFilters || { tema: '', temaRaw: '', criterios: [], vara: '', fase: '' };
  const evidence = getAppliedEvidence(processo, f);
  const theme = f.tema ? temaMatch(processo, f.tema) : null;
  const affinity = affinityFor(processo);

  els.detailContent.innerHTML = `
    <div class="drawer-process"><small>Registro da fonte de dados</small><strong>${escapeHTML(processo.id)}</strong>
      <dl class="process-facts">
        <div><dt>Classe</dt><dd>${escapeHTML(processo.classe)}</dd></div>
        <div><dt>Unidade</dt><dd>${escapeHTML(processo.vara)}</dd></div>
        <div><dt>Fase</dt><dd>${escapeHTML(processo.fase)}</dd></div>
        <div><dt>Assunto</dt><dd>${escapeHTML(processo.assunto)}</dd></div>
        <div><dt>Reclamado</dt><dd>${escapeHTML(processo.reclamado || 'Não informado')}</dd></div>
        <div><dt>Valor da causa</dt><dd>${formatBRL(processo.valor)}</dd></div>
        <div><dt>Porte</dt><dd>${escapeHTML(processo.porte || 'Não informado')}</dd></div>
        <div><dt>Ramo</dt><dd>${escapeHTML(processo.ramo || 'Não informado')}</dd></div>
        <div><dt>Tempo de serviço</dt><dd>${processo.tempoServicoMeses == null ? 'Não informado' : `${processo.tempoServicoMeses} meses`}</dd></div>
        <div><dt>Verbas pleiteadas</dt><dd>${escapeHTML((processo.verbas || []).join(', ') || 'Não informado')}</dd></div>
      </dl>
    </div>

    <section class="drawer-section affinity-explanation">
      <div class="drawer-section-title">Faixa demonstrativa de afinidade: ${affinityLabel(affinity)}</div>
      <p>Faixa explicável de triagem, sem pontuação numérica. Não representa probabilidade, previsão ou recomendação de acordo.</p>
      <ul>${affinityExplanation(processo).map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
    </section>

    <section class="drawer-section">
      <div class="drawer-section-title">Fatores para uma tentativa de acordo</div>
      <p class="explanation-intro">Informações descritivas para apoiar a análise humana. Não são pontuação, conclusão jurídica nem indicação de resultado.</p>
      ${renderAgreementFactors(processo)}
    </section>

    ${f.tema && theme?.ok ? `<section class="drawer-section">
      <div class="drawer-section-title">Origem da correspondência temática</div>
      <div class="theme-source-summary">${renderSourceBadges(theme)}<p>${escapeHTML(theme.motivo)}</p></div>
    </section>` : ''}

    ${renderRespondentHistory(processo)}

    <section class="drawer-section profile-section">
      <div class="drawer-section-title">Perfil da empresa e do contrato</div>
      <dl class="profile-facts">
        <div><dt>Reclamado</dt><dd>${escapeHTML(processo.reclamado || 'Não informado')}</dd></div>
        <div><dt>Porte da empresa</dt><dd>${escapeHTML(processo.porte || 'Não informado')}</dd></div>
        <div><dt>Ramo empresarial</dt><dd>${escapeHTML(processo.ramo || 'Não informado')}</dd></div>
        <div><dt>Tempo de serviço</dt><dd>${processo.tempoServicoMeses == null ? 'Não informado' : `${processo.tempoServicoMeses} meses`}</dd></div>
        <div><dt>Verbas pleiteadas</dt><dd>${escapeHTML((processo.verbas || []).join(', ') || 'Não informado')}</dd></div>
      </dl>
      <p class="history-disclaimer">Perfil meramente descritivo. Porte, ramo, tempo de serviço e verbas não determinam capacidade de acordo.</p>
    </section>

    ${renderSimilarAgreements(processo)}

    <section class="drawer-section registered-topics">
      <div class="drawer-section-title">Assuntos e prioridades cadastrados</div>
      <div class="registered-topic-row"><strong>Assunto do processo</strong><span class="registered-topic">${escapeHTML(processo.assunto || 'Não informado')}</span></div>
      <div class="registered-topic-row"><strong>Temas associados no cadastro</strong><div class="registered-topic-list">${(processo.temas || []).length
        ? processo.temas.map(item => `<span class="registered-topic">${escapeHTML(item)}</span>`).join('')
        : '<span class="registered-topic-missing">Nenhum tema associado cadastrado.</span>'}</div></div>
      <div class="registered-topic-row"><strong>Prioridades cadastradas</strong><div class="registered-topic-list">${(processo.prioridades || []).length
        ? processo.prioridades.map(item => `<span class="registered-priority">${escapeHTML(item)}</span>`).join('')
        : '<span class="registered-topic-missing">Nenhuma prioridade cadastrada na fonte.</span>'}</div></div>
      <p class="history-disclaimer">Os assuntos e prioridades são exibidos como constam na fonte. O protótipo não atribui prioridade jurídica.</p>
    </section>

    <section class="drawer-section">
      <div class="drawer-section-title">O que fez este processo entrar na consulta</div>
      <div class="drawer-evidence">
        ${evidence.map(item => `<div class="evidence-row"><span class="evidence-icon ${item.type === 'theme' ? 'theme' : 'signal'}">${item.type === 'theme' ? 'T' : '✓'}</span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail)}</p></div></div>`).join('') || '<p class="drawer-empty">Nenhuma evidência aplicada foi identificada.</p>'}
      </div>
    </section>

    ${f.tema && theme?.textual ? `<section class="drawer-section"><div class="drawer-section-title">Trecho que sustentou a correspondência textual</div><div class="text-excerpt">${highlightExcerpt(processo.texto, f.temaRaw, theme)}</div>${theme.approximate ? '<p class="excerpt-note">Correspondência aproximada exclusiva desta demonstração; não representa classificação jurídica nem modelo de IA treinado.</p>' : ''}</section>` : ''}

    <section class="drawer-section petition-section">
      <details class="petition-disclosure">
        <summary>Ler a petição inicial (simulada)</summary>
        <p class="petition-notice">Leitura simulada com texto fictício. O protótipo não acessa nem interpreta documentos reais.</p>
        <div class="text-excerpt">${escapeHTML(processo.texto || 'Nenhum texto disponível na fonte consultada.')}</div>
      </details>
    </section>

    <section class="drawer-section">
      <div class="drawer-section-title">Limitações conhecidas do registro</div>
      <div class="drawer-evidence">
        ${processo.dadosAusentes.length
          ? processo.dadosAusentes.map(item => `<div class="evidence-row"><span class="evidence-icon missing">?</span><div><strong>Informação insuficiente</strong><p>${escapeHTML(item)}</p></div></div>`).join('')
          : '<div class="evidence-row"><span class="evidence-icon missing">i</span><div><strong>Sem ausência específica marcada</strong><p>Isso não significa que um processo real teria todas as informações necessárias.</p></div></div>'}
      </div>
    </section>

    <div class="detail-actions">
      <button type="button" class="detail-select-btn" data-detail-action="select" data-id="${escapeHTML(processo.id)}">${selected.has(processo.id) ? 'Remover da seleção' : 'Incluir na seleção'}</button>
      <button type="button" class="detail-agenda-btn" data-detail-action="${agenda.has(processo.id) ? 'open-agenda' : 'agenda'}" data-id="${escapeHTML(processo.id)}">${agenda.has(processo.id) ? 'Ver situação na pauta' : 'Adicionar à pauta'}</button>
      <button type="button" class="detail-discard-btn" data-detail-action="discard" data-id="${escapeHTML(processo.id)}">Descartar da triagem</button>
    </div>
    <div class="human-decision-box"><strong>O sistema organiza evidências. O profissional decide.</strong><p>Este resultado apoia a triagem e não representa previsão de acordo, recomendação jurídica ou encaminhamento automático.</p></div>`;
  els.detailPanel.hidden = false;
  document.body.classList.add('detail-open');
  els.drawerBackdrop.hidden = !isMobile();
}

function fecharDetalhes() {
  detailId = null;
  els.detailPanel.hidden = true;
  els.drawerBackdrop.hidden = true;
  document.body.classList.remove('detail-open');
}

function limparSelecao() {
  selected.clear();
  selectedContext.clear();
  atualizarSelecao();
  renderResultados();
  if (els.selectionDialog.open) els.selectionDialog.close();
}

function limparTudo() {
  els.tema.value = '';
  $$('.criterio').forEach(c => c.checked = false);
  FILTER_KEYS.forEach(key => activeFilters[key].clear());
  currentResults = [];
  appliedFilters = null;
  renderDraftQuery();
  renderAppliedQuery();
  renderResultados();
  fecharDetalhes();
  setStatus('info', 'Consulta limpa', selected.size
    ? 'A seleção de processos foi mantida. Defina novos critérios ou revise a seleção.'
    : 'Defina um tema, critério ou filtro detalhado no painel de consulta.');
}

function newQuery() { limparTudo(); openQuery(); setTimeout(() => els.tema.focus(), 80); }
function isMobile() { return window.innerWidth <= 900; }

function openQuery() {
  if (isMobile()) document.body.classList.add('query-open');
  else document.body.classList.remove('query-collapsed');
  updateQueryToggle();
}

function toggleQuery() {
  if (isMobile()) document.body.classList.toggle('query-open');
  else document.body.classList.toggle('query-collapsed');
  updateQueryToggle();
}

function updateQueryToggle() {
  const expanded = isMobile() ? document.body.classList.contains('query-open') : !document.body.classList.contains('query-collapsed');
  els.btnToggleQuery.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  els.btnToggleQuery.setAttribute('aria-label', expanded ? 'Ocultar painel de consulta' : 'Mostrar painel de consulta');
  els.btnToggleQuery.title = expanded ? 'Ocultar painel de consulta' : 'Mostrar painel de consulta';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function loadAgenda() {
  let raw;
  try {
    raw = localStorage.getItem('concilia23-agenda-v1');
  } catch (error) {
    console.error('Não foi possível acessar a pauta local.', error);
    showToast('O navegador não permite armazenar a pauta; ela ficará disponível somente nesta sessão.');
    return;
  }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    const validStates = ['em_analise', 'aprovado', 'registrado_demo'];
    const validFilters = filters => filters && typeof filters === 'object'
      && typeof filters.temaRaw === 'string' && typeof filters.tema === 'string'
      && Array.isArray(filters.criterios) && filters.criterios.every(item => typeof item === 'string')
      && filters.advanced && typeof filters.advanced === 'object'
      && FILTER_KEYS.every(key => filters.advanced[key] === undefined
        || (Array.isArray(filters.advanced[key]) && filters.advanced[key].every(value => typeof value === 'string')));
    if (!saved || !Array.isArray(saved.items) || !Array.isArray(saved.log)
      || !saved.items.every(item => item && typeof item.id === 'string' && validStates.includes(item.state)
        && typeof item.addedAt === 'string' && validFilters(item.filters))
      || !saved.log.every(item => item && typeof item.when === 'string' && typeof item.id === 'string' && typeof item.action === 'string')) {
      throw new Error('Formato de pauta local inválido.');
    }
    const processIds = new Set(processos.map(processo => processo.id));
    if (saved.items.some(item => !processIds.has(item.id))) {
      throw new Error('A pauta contém processos que não existem na fonte de dados atual.');
    }
    saved.items.forEach(item => agenda.set(item.id, item));
    agendaLog.push(...saved.log.slice(-100));
  } catch (error) {
    console.error('Não foi possível carregar a pauta local.', error);
    showToast('A pauta salva está inválida ou não corresponde à fonte de dados atual. Ela não foi carregada.');
  }
}

function saveAgenda() {
  try {
    localStorage.setItem('concilia23-agenda-v1', JSON.stringify({
      items: [...agenda.values()],
      log: agendaLog.slice(-100)
    }));
  } catch (error) {
    console.error('Não foi possível salvar a pauta neste navegador.', error);
    showToast('Não foi possível salvar a pauta. As alterações permanecem somente nesta sessão.');
    return false;
  }
  return true;
}

function recordAgendaAction(id, action) {
  agendaLog.push({ id, action, when: new Date().toISOString() });
  if (agendaLog.length > 100) agendaLog.splice(0, agendaLog.length - 100);
}

function renderAgenda() {
  const items = [...agenda.values()].map(meta => ({
    meta,
    processo: processos.find(processo => processo.id === meta.id)
  })).filter(item => item.processo);
  const counts = {
    review: items.filter(item => item.meta.state === 'em_analise').length,
    approved: items.filter(item => item.meta.state === 'aprovado').length,
    sent: items.filter(item => item.meta.state === 'registrado_demo').length
  };
  agendaEls.count.textContent = items.length;
  agendaEls.reviewCount.textContent = counts.review;
  agendaEls.approvedCount.textContent = counts.approved;
  agendaEls.sentCount.textContent = counts.sent;
  agendaEls.confirm.disabled = counts.approved === 0;
  agendaEls.empty.hidden = items.length > 0;
  agendaEls.list.innerHTML = items.map(({ processo, meta }) => {
    const filters = meta.filters;
    const evidence = getAppliedEvidence(processo, filters);
    const theme = filters.tema ? temaMatch(processo, filters.tema) : null;
    const statusLabels = {
      em_analise: 'Aguardando decisão humana',
      aprovado: 'Aprovado pelo usuário',
      registrado_demo: 'Registro demonstrativo concluído'
    };
    const isSent = meta.state === 'registrado_demo';
    const criteria = [
      filters.temaRaw ? `Tema: ${filters.temaRaw}` : '',
      ...(filters.criterios || []).map(criterioLabel),
      ...FILTER_KEYS.flatMap(key => (filters.advanced?.[key] || []).map(value => `${FILTER_TITLES[key]}: ${filterOptionLabel(key, value)}`))
    ].filter(Boolean);
    return `<article class="agenda-card">
      <div class="agenda-card-heading">
        <div><span class="agenda-status ${meta.state}">${statusLabels[meta.state]}</span><h2>${escapeHTML(processo.id)}</h2><p>${escapeHTML(processo.classe)} · ${escapeHTML(processo.fase)} · ${escapeHTML(processo.vara)}</p></div>
        <span class="affinity-label">Afinidade demonstrativa: ${escapeHTML(affinityLabel(affinityFor(processo)))}</span>
      </div>
      <div class="agenda-facts">
        <div><span>Assunto</span><strong>${escapeHTML(processo.assunto)}</strong></div>
        <div><span>Reclamado</span><strong>${escapeHTML(processo.reclamado || 'Não informado')}</strong></div>
        <div><span>Valor da causa</span><strong>${escapeHTML(formatBRL(processo.valor))}</strong></div>
        <div><span>Porte / ramo</span><strong>${escapeHTML(processo.porte || 'Não informado')} · ${escapeHTML(processo.ramo || 'Não informado')}</strong></div>
        <div><span>Tempo de serviço</span><strong>${processo.tempoServicoMeses == null ? 'Não informado' : `${processo.tempoServicoMeses} meses`}</strong></div>
        <div><span>Verbas pleiteadas</span><strong>${escapeHTML((processo.verbas || []).join(', ') || 'Não informado')}</strong></div>
      </div>
      <section class="agenda-evidence"><h3>Critérios da consulta e evidências</h3>
        <p>${criteria.length ? criteria.map(escapeHTML).join(' · ') : 'Nenhum critério de busca registrado.'}</p>
        ${filters.tema && theme?.ok ? `<p><strong>Correspondência do tema:</strong> ${escapeHTML(theme.sources.join(' + '))}. ${escapeHTML(theme.motivo)}</p>` : ''}
        ${filters.tema && theme?.textual ? `<p><strong>Trecho textual relevante:</strong> ${highlightExcerpt(processo.texto, filters.temaRaw, theme)}</p>` : ''}
        <ul>${evidence.map(item => `<li><strong>${escapeHTML(item.title)}:</strong> ${escapeHTML(item.detail)}</li>`).join('') || '<li>Não há evidência correspondente registrada para os critérios atuais.</li>'}</ul>
      </section>
      <div class="agenda-card-footer">
        <span>Adicionado ${new Date(meta.addedAt).toLocaleString('pt-BR')}</span>
        <div>
          <button type="button" class="portal-button secondary" data-agenda-action="detail" data-id="${escapeHTML(processo.id)}">Ver detalhe completo</button>
          ${!isSent ? `<button type="button" class="portal-button ${meta.state === 'aprovado' ? 'secondary' : 'approve'}" data-agenda-action="approve" data-id="${escapeHTML(processo.id)}">${meta.state === 'aprovado' ? 'Retirar aprovação' : 'Aprovar para a pauta'}</button>` : ''}
          <button type="button" class="agenda-remove" data-agenda-action="remove" data-id="${escapeHTML(processo.id)}"${isSent ? ' aria-label="Remover registro demonstrativo"' : ''}>${isSent ? 'Remover registro' : 'Retirar da pauta'}</button>
        </div>
      </div>
      ${processo.dadosAusentes.length ? `<div class="agenda-warning"><strong>Informação insuficiente:</strong> ${processo.dadosAusentes.map(escapeHTML).join('; ')}</div>` : ''}
    </article>`;
  }).join('');
  agendaEls.log.innerHTML = agendaLog.length
    ? `<ol>${agendaLog.slice().reverse().slice(0, 15).map(item => `<li><time>${new Date(item.when).toLocaleString('pt-BR')}</time><strong>${escapeHTML(item.id)}</strong><span>${escapeHTML(item.action)}</span></li>`).join('')}</ol>`
    : '<p>Nenhuma decisão registrada nesta demonstração.</p>';
}

function addToAgenda(id, openDetails = true) {
  const processo = processos.find(item => item.id === id);
  if (!processo) return;
  if (agenda.has(id)) {
    showToast('Este processo já está na pauta.');
    return;
  }
  const filters = appliedFilters || { temaRaw: '', tema: '', criterios: [], advanced: {} };
  agenda.set(id, {
    id,
    state: 'em_analise',
    addedAt: new Date().toISOString(),
    filters: JSON.parse(JSON.stringify(filters))
  });
  recordAgendaAction(id, 'Adicionado à pauta para revisão');
  saveAgenda();
  renderAgenda();
  renderResultados();
  if (openDetails) abrirDetalhes(id);
  showToast('Processo adicionado à pauta para análise humana.');
}

function switchView(view) {
  const showAgenda = view === 'agenda';
  document.body.classList.toggle('agenda-view', showAgenda);
  $('.skip-link').href = showAgenda ? '#pauta-view' : '#main-workspace';
  $('#main-workspace').hidden = showAgenda;
  agendaEls.view.hidden = !showAgenda;
  $$('.portal-nav-item').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (showAgenda) {
    fecharDetalhes();
    renderAgenda();
  } else {
    closeQueryOverlay();
  }
}

function confirmAgenda() {
  const approved = [...agenda.values()].filter(item => item.state === 'aprovado');
  if (!approved.length) {
    showToast('Aprove ao menos um processo antes de registrar o encaminhamento demonstrativo.');
    return;
  }
  if (!window.confirm(`Registrar ${approved.length} processo(s) como encaminhados para análise do CEJUSC nesta demonstração? Nenhum dado será enviado ao CEJUSC ou ao PJe.`)) return;
  const when = new Date().toISOString();
  approved.forEach(item => {
    item.state = 'registrado_demo';
    item.recordedAt = when;
    recordAgendaAction(item.id, 'Encaminhamento demonstrativo registrado localmente');
  });
  saveAgenda();
  renderAgenda();
  showToast('Registro demonstrativo concluído; nenhum processo foi enviado externamente.');
}

function clearAgenda() {
  if (!agenda.size) {
    showToast('A pauta já está vazia.');
    return;
  }
  if (!window.confirm('Retirar todos os processos da pauta? O registro de decisões será mantido.')) return;
  [...agenda.keys()].forEach(id => recordAgendaAction(id, 'Retirado da pauta'));
  agenda.clear();
  saveAgenda();
  renderAgenda();
  showToast('Pauta limpa. O registro de decisões foi mantido.');
}

function exportAgendaCSV() {
  if (!agenda.size) {
    showToast('Adicione processos à pauta antes de exportar.');
    return;
  }
  const headers = ['Processo', 'Classe', 'Fase', 'Unidade', 'Assunto', 'Reclamado', 'Valor da causa', 'Porte', 'Ramo', 'Tempo de serviço (meses)', 'Verbas pleiteadas', 'Faixa demonstrativa', 'Tema', 'Critérios da consulta', 'Estado da revisão', 'Adicionado em', 'Observação'];
  const stateLabels = { em_analise: 'Aguardando decisão humana', aprovado: 'Aprovado pelo usuário', registrado_demo: 'Registro demonstrativo concluído' };
  const rows = [...agenda.values()].map(meta => {
    const p = processos.find(item => item.id === meta.id);
    const criteria = [
      meta.filters.temaRaw ? `Tema: ${meta.filters.temaRaw}` : '',
      ...(meta.filters.criterios || []).map(criterioLabel),
      ...FILTER_KEYS.flatMap(key => (meta.filters.advanced?.[key] || []).map(value => `${FILTER_TITLES[key]}: ${filterOptionLabel(key, value)}`))
    ].filter(Boolean);
    return [
      p.id, p.classe, p.fase, p.vara, p.assunto, p.reclamado || '', p.valor ?? '', p.porte || '', p.ramo || '',
      p.tempoServicoMeses ?? '', (p.verbas || []).join(', '), affinityLabel(affinityFor(p)), meta.filters.temaRaw || '',
      criteria.join('; '), stateLabels[meta.state], new Date(meta.addedAt).toLocaleString('pt-BR'),
      'Protótipo local: nenhum dado enviado ao CEJUSC ou ao PJe'
    ];
  });
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `concilia23-pauta-demonstrativa-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast('Pauta demonstrativa exportada em CSV.');
}

function closeQueryOverlay() {
  document.body.classList.remove('query-open');
  updateQueryToggle();
}

function removeSelected(id) {
  selected.delete(id);
  selectedContext.delete(id);
  atualizarSelecao();
  renderResultados();
  if (!selected.size && els.selectionDialog.open) {
    els.selectionDialog.close();
  } else if (els.selectionDialog.open) {
    renderSelectionReview();
  }
}

function renderSelectionReview() {
  els.selectionReviewList.innerHTML = [...selected].map(id => {
    const p = processos.find(x => x.id === id);
    if (!p) return '';
    const meta = selectedContext.get(id);
    return `<article class="selection-review-item">
      <div><strong>${escapeHTML(p.id)}</strong><span>${escapeHTML(p.vara)} · ${escapeHTML(p.fase)}</span><small>${escapeHTML(p.assunto)}</small>${meta?.filters ? `<small class="selection-context">Selecionado com: ${escapeHTML(describeFilters(meta.filters))}</small>` : ''}</div>
      <button type="button" class="remove-selected" data-id="${escapeHTML(p.id)}">Remover</button>
    </article>`;
  }).join('');
}

function reviewSelected() {
  if (!selected.size) {
    showToast('Nenhum processo selecionado.');
    return;
  }
  renderSelectionReview();
  if (!els.selectionDialog.open) els.selectionDialog.showModal();
}

function exportSelectedCSV() {
  if (!selected.size) { showToast('Nenhum processo selecionado para exportar.'); return; }
  const headers = ['Processo', 'Vara', 'Fase', 'Classe', 'Assunto', 'Valor da causa', 'Tema consultado', 'Origem temática', 'Critérios aplicados', 'Consulta usada na seleção', 'Selecionado em', 'Fonte dos dados'];
  const rows = [...selected].map(id => {
    const p = processos.find(x => x.id === id);
    const meta = selectedContext.get(id);
    const f = meta?.filters || appliedFilters || { tema: '', temaRaw: '', criterios: [], vara: '', fase: '' };
    const theme = f.tema ? temaMatch(p, f.tema) : null;
    return [
      p.id, p.vara, p.fase, p.classe, p.assunto, p.valor == null ? '' : p.valor,
      f.temaRaw || '', theme?.sources?.join(' + ') || '', f.criterios.map(criterioLabel).join('; '), describeFilters(f),
      meta?.selectedAt ? new Date(meta.selectedAt).toLocaleString('pt-BR') : '', dataSource.label
    ];
  });
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `concilia23-selecao-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast('Seleção exportada em CSV.');
}

function bindEvents() {
  els.themeDialog.addEventListener('close', () => {
    if (themeManagerOpener instanceof HTMLElement && themeManagerOpener.isConnected) themeManagerOpener.focus();
    themeManagerOpener = null;
  });
  els.themeDialog.addEventListener('click', event => {
    const removeSubject = event.target.closest('[data-theme-remove-subject]');
    if (removeSubject && themeEditorDraft) {
      themeEditorDraft.subjects = themeEditorDraft.subjects.filter(subject => subject !== removeSubject.dataset.themeRemoveSubject);
      renderThemeSubjectOptions();
      $('#theme-subject-search').value = themeSubjectSearch;
      return;
    }
    const action = event.target.closest('[data-theme-action]');
    if (!action) return;
    const { themeAction, id } = action.dataset;
    if (themeAction === 'edit') openThemeEditor(id);
    if (themeAction === 'new') openThemeEditor();
    if (themeAction === 'back') {
      themeEditorView = 'list';
      themeEditorDraft = null;
      renderThemeManager();
    }
    if (themeAction === 'remove') removeTheme(id);
    if (themeAction === 'restore') restoreThemes();
    if (themeAction === 'close') els.themeDialog.close();
  });
  els.themeDialog.addEventListener('input', event => {
    if (event.target.id === 'theme-subject-search') {
      themeSubjectSearch = event.target.value;
      renderThemeSubjectOptions();
      $('#theme-subject-search')?.focus();
    }
    if (event.target.id === 'theme-terms') updateThemeTermCount();
  });
  els.themeDialog.addEventListener('change', event => {
    if (event.target.matches('[data-theme-subject]')) {
      const value = event.target.value;
      if (event.target.checked && !themeEditorDraft.subjects.includes(value)) themeEditorDraft.subjects.push(value);
      if (!event.target.checked) themeEditorDraft.subjects = themeEditorDraft.subjects.filter(subject => subject !== value);
      renderThemeSubjectOptions();
      $('#theme-subject-search').value = themeSubjectSearch;
      $('#theme-subject-search').focus();
    }
    if (event.target.matches('[data-theme-priority]')) {
      const value = event.target.value;
      if (event.target.checked && !themeEditorDraft.priorities.includes(value)) themeEditorDraft.priorities.push(value);
      if (!event.target.checked) themeEditorDraft.priorities = themeEditorDraft.priorities.filter(priority => priority !== value);
    }
  });
  els.themeDialog.addEventListener('submit', event => {
    if (event.target.id !== 'theme-form') return;
    event.preventDefault();
    saveTheme();
  });
  $$('[data-view]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    switchView(button.dataset.view);
  }));
  agendaEls.list.addEventListener('click', event => {
    const button = event.target.closest('[data-agenda-action]');
    if (!button) return;
    const { id, agendaAction } = button.dataset;
    if (agendaAction === 'detail') {
      switchView('triage');
      abrirDetalhes(id, agenda.get(id)?.filters);
    } else if (agendaAction === 'remove') {
      agenda.delete(id);
      recordAgendaAction(id, 'Retirado da pauta');
      saveAgenda();
      renderAgenda();
    } else if (agendaAction === 'approve') {
      const item = agenda.get(id);
      if (!item || item.state === 'registrado_demo') return;
      item.state = item.state === 'aprovado' ? 'em_analise' : 'aprovado';
      item.reviewedAt = new Date().toISOString();
      recordAgendaAction(id, item.state === 'aprovado' ? 'Aprovado pelo usuário para a pauta' : 'Aprovação retirada pelo usuário');
      saveAgenda();
      renderAgenda();
    }
  });
  agendaEls.confirm.addEventListener('click', confirmAgenda);
  agendaEls.clear.addEventListener('click', clearAgenda);
  agendaEls.export.addEventListener('click', exportAgendaCSV);
  els.btnPesquisar.addEventListener('click', pesquisar);
  els.btnSearchTheme.addEventListener('click', pesquisar);
  els.btnLimpar.addEventListener('click', limparTudo);
  els.btnNewQuery.addEventListener('click', newQuery);
  els.btnEmptyFocus.addEventListener('click', openQuery);
  els.btnToggleQuery.addEventListener('click', toggleQuery);
  els.btnCloseDetail.addEventListener('click', fecharDetalhes);
  els.drawerBackdrop.addEventListener('click', fecharDetalhes);
  els.btnClearSelected.addEventListener('click', () => { limparSelecao(); showToast('Seleção limpa.'); });
  els.btnReviewSelected.addEventListener('click', () => reviewSelected());
  els.btnExportSelected.addEventListener('click', exportSelectedCSV);
  els.btnCloseSelection.addEventListener('click', () => els.selectionDialog.close());
  els.btnAbout.addEventListener('click', () => els.aboutDialog.showModal());
  els.btnManageThemes.addEventListener('click', openThemeManager);
  els.btnClearFilters.addEventListener('click', () => {
    FILTER_KEYS.forEach(key => activeFilters[key].clear());
    refreshAppliedResults();
  });
  els.btnClearCriteria.addEventListener('click', () => {
    const checkedCriteria = $$('.criterio:checked');
    if (!checkedCriteria.length) {
      showToast('Nenhum critério de conciliação marcado.');
      return;
    }
    $$('.criterio').forEach(input => { input.checked = false; });
    handleDraftChange();
  });
  els.btnRestoreDiscarded.addEventListener('click', restoreDiscarded);
  els.advancedFilters.addEventListener('change', event => {
    const input = event.target.closest('[data-filter-key]');
    if (!input) return;
    const filters = activeFilters[input.dataset.filterKey];
    if (input.checked) filters.add(input.value);
    else filters.delete(input.value);
    refreshAppliedResults();
  });
  els.selectedMiniList.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-selected]');
    if (button) removeSelected(button.dataset.removeSelected);
  });
  els.selectionReviewList.addEventListener('click', event => {
    const button = event.target.closest('.remove-selected');
    if (button) removeSelected(button.dataset.id);
  });
  els.detailContent.addEventListener('click', event => {
    const button = event.target.closest('[data-detail-action]');
    if (!button) return;
    if (button.dataset.detailAction === 'select') toggleSelected(button.dataset.id);
    if (button.dataset.detailAction === 'discard') discardProcess(button.dataset.id);
    if (button.dataset.detailAction === 'agenda') addToAgenda(button.dataset.id);
    if (button.dataset.detailAction === 'open-agenda') switchView('agenda');
  });

  els.tema.addEventListener('input', handleDraftChange);
  $$('.criterio').forEach(el => el.addEventListener('change', handleDraftChange));
  els.tema.addEventListener('keydown', e => { if (e.key === 'Enter') pesquisar(); });

  window.addEventListener('resize', updateQueryToggle);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      fecharDetalhes();
      document.body.classList.remove('query-open');
      updateQueryToggle();
    }
  });
}

async function init() {
  bindEvents();
  updateQueryToggle();
  els.btnPesquisar.disabled = true;
  $('#empty-state h4').textContent = 'Carregando processos';
  $('#empty-state p').textContent = 'Aguarde enquanto a fonte de dados é preparada para a consulta.';
  setStatus('info', 'Carregando dados', 'Preparando a fonte de processos para consulta.');

  try {
    const result = await window.Concilia23DataAdapter.load();
    processos = result.processos;
    dataSource = { label: result.label, demo: result.demo };
    loadAgenda();
    loadThemeConfig();
    buildThemeCatalog();
    dataLoaded = true;
    els.dataSourceTitle.textContent = dataSource.demo ? 'Protótipo demonstrativo' : 'Fonte de dados ativa';
    els.dataSourceLabel.textContent = dataSource.label;
    els.dataSourceStatus.textContent = dataSource.demo ? 'Demonstração' : 'Dados conectados';
    els.btnPesquisar.disabled = false;
    renderQuickThemes();
    renderThemeManager();
    renderDraftQuery();
    renderAppliedQuery();
    renderResultados();
    renderAdvancedFilters();
    renderAgenda();
    atualizarSelecao();
    if (themeConfigWarning) setStatus('warning', 'Problema no catálogo de temas', themeConfigWarning);
    else setStatus('info', 'Pronto para analisar', 'Defina um tema, critério de conciliação ou use os filtros detalhados.');
  } catch (error) {
    console.error('Falha ao carregar a fonte de processos do Concilia23.', error);
    $('#empty-state h4').textContent = 'Não foi possível carregar os processos';
    $('#empty-state p').textContent = 'Verifique a fonte de dados configurada e tente novamente.';
    setStatus('error', 'Falha ao carregar os dados', error instanceof Error ? error.message : 'Ocorreu um erro desconhecido ao preparar a fonte de processos.');
  }
}

document.addEventListener('DOMContentLoaded', init);
