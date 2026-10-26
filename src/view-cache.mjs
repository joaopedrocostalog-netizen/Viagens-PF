/** Um resultado por consumidor, contendo índices/referências; nunca pré-carrega páginas. */
const entries = new Map();
export function memoView(name, deps, build) {
  const saved = entries.get(name);
  if (saved && saved.deps.length === deps.length && deps.every((value, i) => value === saved.deps[i]))
    return saved.value;
  const value = build();
  entries.set(name, { deps, value });
  return value;
}
export function clearViewCache() {
  entries.clear();
}
