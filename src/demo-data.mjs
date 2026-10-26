/**
 * Dados FICTÍCIOS de demonstração, no mesmo formato bruto da DSS (listarViagens, listarPedidosFrete,
 * listarOcorrencias, listarProgramacoes). Passam pelo mesmo mapeamento da produção (normalizeOverview),
 * então a demonstração exercita o código real. Datas são relativas a "hoje" para que Programação do dia,
 * etapas da RV, comparativos e alertas tenham conteúdo em qualquer data. Determinístico: sem aleatoriedade.
 */
const CLIENTS = ['MAERSK LOGISTICS', 'MSC BRASIL', 'CMA CGM', 'HAPAG-LLOYD', 'COSCO SHIPPING', 'ONE BRASIL'];
const ROUTES = [
  ['Santos/SP', 'São Paulo/SP'],
  ['Santos/SP', 'Campinas/SP'],
  ['Guarujá/SP', 'Jundiaí/SP'],
  ['Santos/SP', 'Sorocaba/SP'],
  ['Santos/SP', 'Ribeirão Preto/SP'],
  ['Guarujá/SP', 'São José dos Campos/SP'],
  ['Santos/SP', 'Cubatão/SP']
];
const DRIVERS = [
  [101, 'CARLOS ALBERTO SOUZA'],
  [102, 'MARCOS PEREIRA LIMA'],
  [103, 'JOSÉ ROBERTO ALVES'],
  [104, 'ANDERSON FERREIRA'],
  [105, 'PAULO HENRIQUE COSTA'],
  [106, 'RAFAEL MOREIRA'],
  [107, 'LUCAS OLIVEIRA SANTOS'],
  [108, 'EDSON RIBEIRO']
];
const PLATES = ['CUF7H59', 'CCU5118', 'CUL4A55', 'CUC2B46', 'CDR7G70', 'CUL3H74', 'CCU8C25', 'CUI6101', 'CUG5E51'];
const SERVICES = ['normal', 'normal', 'subcontratacao', 'vinculado a multimodal'];
const COSTALOG = ['CRC', 'AC da Costa', 'Comex'];

const pad = n => String(n).padStart(2, '0');
function shift(today, days) {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return pad(date.getUTCDate()) + '/' + pad(date.getUTCMonth() + 1) + '/' + date.getUTCFullYear();
}

/**
 * Cada linha: [dias em relação a hoje do início, duração em dias (null = sem término), etapa DSS].
 * Inclui: viagens do dia em todas as categorias, RVs atravessando hoje, RVs paradas há vários dias
 * (para os alertas de RV parada) e um histórico de ~6 semanas para comparativos.
 */
const PLAN = [
  // Hoje
  [0, null, 'Incluído'],
  [0, null, 'Escalado'],
  [0, null, 'escalada'],
  [0, null, 'Viajando'],
  [0, 0, 'Finalizado'],
  [-1, 1, 'Encerrado'],
  [-2, null, 'Viajando'],
  [1, null, 'Escalado'],
  [2, null, 'Incluído'],
  // Paradas há vários dias (alertas de RV parada)
  [-9, null, 'Escalado'],
  [-6, null, 'Incluído'],
  [-12, null, 'Viajando'],
  [-4, null, 'Viajando'],
  // Últimas semanas
  ...Array.from({ length: 36 }, (_, i) => {
    const start = -40 + i;
    const stage = i % 11 === 5 ? 'cancelado' : i % 3 === 0 ? 'Finalizado' : i % 7 === 3 ? 'Viajando' : 'Encerrado';
    return [start, stage === 'Viajando' ? null : 1 + (i % 3), stage];
  })
];

export function demoPayload(today) {
  const viagens = [],
    pedidos = [],
    ocorrencias = [],
    programacoes = [];
  PLAN.forEach(([offset, length, stage], i) => {
    const empresa = i % 9 === 8 ? 'Ideallog' : COSTALOG[i % 3];
    const rv = 95000 + i,
      [driverId, driverName] = DRIVERS[i % DRIVERS.length],
      [from, to] = ROUTES[i % ROUTES.length],
      plate = PLATES[i % PLATES.length],
      client = CLIENTS[i % CLIENTS.length];
    viagens.push({
      empresa,
      rv_id: rv,
      nro_rv: String(rv),
      status_rv: stage,
      tipo_rv: i % 5 === 4 ? 'LS' : 'RODO',
      cliente_nome: client,
      placa_veiculo: plate,
      data_inicio: shift(today, offset),
      data_termino: length === null ? '' : shift(today, offset + length),
      cidade_inicial: from,
      cidade_final: to,
      motorista_id: driverId,
      motorista_nome: driverName,
      nro_container: 'MSKU' + (4100000 + i * 37),
      nro_mdf: stage === 'Incluído' ? '' : String(65000 + i)
    });
    const orders = i % 4 === 0 ? 2 : 1;
    for (let k = 0; k < orders; k++) {
      const pf = 70000 + i * 2 + k,
        done = ['Finalizado', 'Encerrado'].includes(stage);
      pedidos.push({
        empresa,
        pf_id: pf,
        nro_pf: String(pf),
        // Alguns PF ainda sem CT-e e um CT-e sem RV localizada, como na operação real.
        nro_cte: i % 10 === 7 ? 0 : 31000 + i * 2 + k,
        rv_viagem: i % 17 === 16 ? String(99000 + i) : String(rv),
        cliente_nome: client,
        data_emissao: shift(today, offset - 1),
        tipo_servico: SERVICES[(i + k) % SERVICES.length],
        placa_veiculo: plate,
        motorista_id: driverId,
        motorista_nome: driverName,
        entrega_concluida: done,
        comprovante_entrega: done ? i % 6 !== 1 : false
      });
    }
    if (i % 8 === 2)
      ocorrencias.push({
        empresa,
        ocorrencia_id: 500 + i,
        rv_id: rv,
        nro_rv: String(rv),
        data_ocorrencia: shift(today, offset),
        descricao: i % 16 === 2 ? 'Atraso na liberação do terminal' : 'Avaria leve no container',
        placa_veiculo: plate,
        status: 'Registrada'
      });
    if (offset >= -1 && offset <= 1)
      programacoes.push({
        empresa,
        programacao_id: 8000 + i,
        nro_programacao: 'P-' + (8000 + i),
        rv_id: rv,
        nro_rv: String(rv),
        motorista_id: driverId,
        data_emissao: shift(today, offset)
      });
  });
  return {
    mode: 'demo',
    data: {
      viagens,
      pedidos,
      ctes: [],
      mdfes: [],
      rotas: [],
      ocorrencias,
      programacoes,
      sources: { viagens: true, pedidos: true, ctes: false, mdfes: false, ocorrencias: true, programacoes: true }
    }
  };
}
