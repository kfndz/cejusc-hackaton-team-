(() => {
  const mockProvider = {
    label: 'Dados inteiramente fictícios',
    demo: true,
    async loadProcesses() {
      if (!Array.isArray(window.PROCESSOS_SIMULADOS)) {
        throw new Error('A lista de processos simulados não está disponível.');
      }
      return window.PROCESSOS_SIMULADOS;
    }
  };

  const provider = window.CONCILIA23_DATA_PROVIDER || mockProvider;

  function requiredText(record, field, index) {
    const value = record[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Registro ${index + 1}: campo obrigatório "${field}" ausente ou inválido.`);
    }
    return value.trim();
  }

  function optionalText(record, field, index) {
    const value = record[field];
    if (value == null) return '';
    if (typeof value !== 'string') {
      throw new Error(`Registro ${index + 1}: campo "${field}" deve ser texto.`);
    }
    return value;
  }

  function nullableText(record, field, index) {
    const value = record[field];
    if (value == null) return null;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Registro ${index + 1}: campo "${field}" deve ser texto não vazio ou null.`);
    }
    return value.trim();
  }

  function optionalNumber(record, field, index) {
    const value = record[field];
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Registro ${index + 1}: campo "${field}" deve ser número ou null.`);
    }
    return value;
  }

  function optionalBoolean(record, field, index) {
    const value = record[field];
    if (value == null) return null;
    if (typeof value !== 'boolean') {
      throw new Error(`Registro ${index + 1}: campo "${field}" deve ser booleano ou null.`);
    }
    return value;
  }

  function stringList(record, field, index) {
    const value = record[field];
    if (value == null) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      throw new Error(`Registro ${index + 1}: campo "${field}" deve ser uma lista de textos.`);
    }
    return value;
  }

  function nullableStringList(record, field, index) {
    const value = record[field];
    if (value == null) return null;
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      throw new Error(`Registro ${index + 1}: campo "${field}" deve ser uma lista de textos ou null.`);
    }
    return value;
  }

  function normalizeProcess(record, index) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Registro ${index + 1}: esperado um objeto de processo.`);
    }

    const agreementCount = optionalNumber(record, 'acordosAnteriores', index);
    if (agreementCount != null && (!Number.isInteger(agreementCount) || agreementCount < 0)) {
      throw new Error(`Registro ${index + 1}: "acordosAnteriores" deve ser inteiro não negativo ou null.`);
    }

    const historicoAcordos = optionalBoolean(record, 'historicoAcordos', index);
    const recorrenciaReclamado = optionalBoolean(record, 'recorrenciaReclamado', index);
    const valor = optionalNumber(record, 'valor', index);
    if (valor != null && valor < 0) {
      throw new Error(`Registro ${index + 1}: "valor" deve ser não negativo ou null.`);
    }
    const tempoServicoMeses = optionalNumber(record, 'tempoServicoMeses', index);
    if (tempoServicoMeses != null && (!Number.isInteger(tempoServicoMeses) || tempoServicoMeses < 0)) {
      throw new Error(`Registro ${index + 1}: "tempoServicoMeses" deve ser inteiro não negativo ou null.`);
    }
    const verbas = nullableStringList(record, 'verbas', index);
    const dadosAusentes = stringList(record, 'dadosAusentes', index).slice();
    if (historicoAcordos == null && !dadosAusentes.some(item => /hist[oó]rico/i.test(item))) {
      dadosAusentes.push('Histórico de acordos indisponível na fonte consultada.');
    }
    if (recorrenciaReclamado == null && !dadosAusentes.some(item => /recorr[eê]ncia/i.test(item))) {
      dadosAusentes.push('Informação de recorrência indisponível na fonte consultada.');
    }
    if (valor == null && !dadosAusentes.some(item => /valor/i.test(item))) {
      dadosAusentes.push('Valor da causa indisponível na fonte consultada.');
    }
    if (record.porte == null && !dadosAusentes.some(item => /porte/i.test(item))) {
      dadosAusentes.push('Porte da empresa indisponível na fonte consultada.');
    }
    if (record.ramo == null && !dadosAusentes.some(item => /ramo/i.test(item))) {
      dadosAusentes.push('Ramo empresarial indisponível na fonte consultada.');
    }
    if (tempoServicoMeses == null && !dadosAusentes.some(item => /tempo de servi/i.test(item))) {
      dadosAusentes.push('Tempo de serviço indisponível na fonte consultada.');
    }
    if (verbas == null && !dadosAusentes.some(item => /verbas/i.test(item))) {
      dadosAusentes.push('Verbas pleiteadas indisponíveis na fonte consultada.');
    }

    return {
      id: requiredText(record, 'id', index),
      vara: requiredText(record, 'vara', index),
      classe: requiredText(record, 'classe', index),
      fase: requiredText(record, 'fase', index),
      assunto: requiredText(record, 'assunto', index),
      reclamado: optionalText(record, 'reclamado', index),
      valor,
      porte: nullableText(record, 'porte', index),
      ramo: nullableText(record, 'ramo', index),
      tempoServicoMeses,
      verbas,
      texto: optionalText(record, 'texto', index),
      temas: stringList(record, 'temas', index),
      prioridades: stringList(record, 'prioridades', index),
      historicoAcordos,
      recorrenciaReclamado,
      acordosAnteriores: agreementCount,
      dadosAusentes
    };
  }

  async function load() {
    if (!provider || typeof provider.loadProcesses !== 'function') {
      throw new Error('A fonte de dados deve implementar loadProcesses().');
    }
    if (typeof provider.label !== 'string' || !provider.label.trim() || typeof provider.demo !== 'boolean') {
      throw new Error('A fonte de dados deve informar label e demo.');
    }

    const records = await provider.loadProcesses();
    if (!Array.isArray(records)) {
      throw new Error('A fonte de dados não retornou uma lista de processos.');
    }

    const processos = records.map(normalizeProcess);
    if (new Set(processos.map(processo => processo.id)).size !== processos.length) {
      throw new Error('A fonte de dados retornou identificadores de processo duplicados.');
    }

    return {
      processos,
      label: provider.label.trim(),
      demo: provider.demo
    };
  }

  window.Concilia23DataAdapter = Object.freeze({ load });
})();
