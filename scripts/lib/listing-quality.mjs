// Do not infer a successful sale from a past auction date.
export function normalizeListings(rows) {
  const seen = new Set();
  return [...rows].sort((a, b) => Number(b.id) - Number(a.id)).filter((row) => {
    const unit = `${row.description || ''} ${row.title || ''}`.match(/(\d{1,4})동\s*(?:\d+층\s*)?(\d{1,5})호/);
    const unitKey = row.unit || (unit ? `${unit[1]}-${unit[2]}` : null);
    const lotKey = row.lotNo ? `lot:${row.lotNo}` : null;
    const key = row.court && row.caseNo && (unitKey || lotKey)
      ? `${row.court.replace(/\s+/g, '')}|${row.caseNo}|${unitKey || lotKey}`
      : `post:${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row) => ({
    ...row,
    sold: row.statusVerified === true && row.status === 'sold',
    minBid: Number.isFinite(row.minBid) && row.minBid > 0
      && (!row.appraisal || row.minBid <= row.appraisal) ? row.minBid : null,
  }));
}
