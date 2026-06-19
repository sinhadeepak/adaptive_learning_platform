export function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllOnPage(set: Set<string>, ids: string[]): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.add(id);
  return next;
}

export function clearPage(set: Set<string>, ids: string[]): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}

export async function resolveAllMatching(
  fetchPage: (offset: number) => Promise<{ ids: string[]; total: number }>,
  cap: number,
): Promise<{ ids: string[]; capped: boolean }> {
  const ids: string[] = [];
  let offset = 0;
  let total = Infinity;
  while (ids.length < total && ids.length < cap) {
    const { ids: pageIds, total: t } = await fetchPage(offset);
    total = t;
    if (pageIds.length === 0) break;
    ids.push(...pageIds);
    offset += pageIds.length;
  }
  const capped = ids.length >= cap && total > cap;
  return { ids: ids.slice(0, cap), capped };
}
