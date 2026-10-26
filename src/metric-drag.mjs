/**
 * "Personalizar cartões": arrastar e soltar os cartões do painel com o mouse (somente com o modo aberto),
 * e setas do teclado no cartão em foco como alternativa acessível.
 * `isActive()` informa se o modo está aberto; `move(id, targetId, after)` e `step(id, delta)` aplicam a nova ordem.
 */
export function installMetricDrag(root, { isActive, move, step }) {
  let dragged = '';
  const target = e => (isActive() && dragged ? e.target?.closest?.('[data-metric-card]') : null);
  const dropAfter = (card, e) => {
    const r = card.getBoundingClientRect();
    return e.clientX > r.left + r.width / 2;
  };
  const clearMarks = () =>
    root
      .querySelectorAll?.('.drop-before,.drop-after,.is-dragging')
      .forEach(el => el.classList.remove('drop-before', 'drop-after', 'is-dragging'));
  root.addEventListener('dragstart', e => {
    const card = isActive() && e.target?.closest?.('[data-metric-card]');
    if (!card) return;
    dragged = card.dataset.metricCard;
    card.classList.add('is-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragged);
    } catch {}
  });
  root.addEventListener('dragover', e => {
    const card = target(e);
    if (!card) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {}
    if (card.dataset.metricCard === dragged) return;
    const after = dropAfter(card, e);
    card.classList.toggle('drop-after', after);
    card.classList.toggle('drop-before', !after);
  });
  root.addEventListener('dragleave', e => {
    const card = target(e);
    if (card && !card.contains(e.relatedTarget)) card.classList.remove('drop-before', 'drop-after');
  });
  root.addEventListener('drop', e => {
    const card = target(e);
    if (!card) return;
    e.preventDefault();
    const id = dragged;
    dragged = '';
    clearMarks();
    move(id, card.dataset.metricCard, dropAfter(card, e));
  });
  root.addEventListener('dragend', () => {
    dragged = '';
    clearMarks();
  });
  /** Para o ouvinte de teclado já existente: true quando a tecla foi usada para mover um cartão. */
  return function handleKey(e) {
    const card = isActive() && e.target?.closest?.('[data-metric-card]');
    if (!card || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return false;
    e.preventDefault();
    step(card.dataset.metricCard, ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1);
    return true;
  };
}

/** Reordena os cartões no HTML da página anterior exibida enquanto o servidor redesenha o painel. */
export function reorderMetricCards(html, layout) {
  if (typeof document?.createElement !== 'function') return html;
  const box = document.createElement('template');
  box.innerHTML = html;
  const grid = box.content.querySelector('.ins-metric-grid');
  if (!grid) return html;
  const cards = new Map([...grid.querySelectorAll('[data-metric-card]')].map(card => [card.dataset.metricCard, card]));
  for (const id of layout) if (cards.has(id)) grid.append(cards.get(id));
  return box.innerHTML;
}
