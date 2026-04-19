const BN = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];

export function toBengaliNumber(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN[+d]);
}
