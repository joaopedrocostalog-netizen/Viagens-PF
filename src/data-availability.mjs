/**
 * Dados que a DSS ainda não envia preenchidos ficam fora das telas, relatórios, comparativos e alertas,
 * em vez de aparecerem como "—" ou zero. Quando a fonte passar a informar KM, troque para true:
 * colunas, cartões, alertas e relatórios voltam sem outras mudanças.
 */
export const KM_FROM_API=false;

const KM_KEYS=new Set(['km','kmPrevisto','kmRodados','desvioKm','custoAbastecimentoKm','kmPerTrip','kmKnown','kmPrevistoFonte']);

/** true quando o campo depende de KM e a DSS ainda não o fornece. */
export const unavailableKey=key=>!KM_FROM_API&&KM_KEYS.has(String(key));

/** Remove colunas indisponíveis. Aceita colunas {key,...} e pares [key,label]. */
export const availableColumns=columns=>(columns||[]).filter(column=>!unavailableKey(Array.isArray(column)?column[0]:column?.key));
