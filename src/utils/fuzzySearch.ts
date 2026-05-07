/**
 * Fuzzy search — matching tolérant aux fautes pour la barre de
 * recherche des Plans. Heuristique simple côté client (zéro deps),
 * suffisante jusqu'à plusieurs milliers de plans.
 *
 * Stratégie en cascade :
 *   1. Normalize : lowercase + accent-strip + trim
 *   2. Si la query est très courte (< 3 chars) → uniquement match
 *      par prefix sur les mots du haystack (évite le bruit du
 *      genre "a" matchant tout)
 *   3. Sinon → match substring direct (rapide, intuitif) OU
 *      Levenshtein ≤ 1 sur les mots du haystack (tolère 1 faute
 *      de frappe — exact ce que le user a demandé "à 1 caractère")
 *
 * Le Levenshtein est calculé via la classique DP O(m*n) — très
 * rapide pour des chaînes courtes. On limite à ≤ 1 pour éviter
 * les faux positifs et garder la perf nickel sur de gros corpus.
 */

/**
 * Strip diacritics (é → e, à → a, etc.) + lowercase + trim.
 * NFKD decompose les caractères accentués en (lettre base +
 * marque combinante), puis on filtre les marques (Unicode block
 * "Combining Diacritical Marks" ̀-ͯ).
 */
export function normalizeText(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Levenshtein distance entre deux strings — minimum d'edits
 * (insert / delete / substitute) pour passer de a à b.
 *
 * Implémentation classique en DP avec optimisation early-exit :
 * on coupe dès qu'on sait que la distance dépassera le maxDist
 * passé en argument. Permet de retourner ~instantanément quand
 * deux mots sont très différents — important pour la perf sur
 * les gros corpus.
 */
export function levenshtein(a: string, b: string, maxDist: number = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Early exit : si la diff de longueur dépasse déjà maxDist, peine
  // perdue. Économise beaucoup sur les corpus avec mots très longs.
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  const m = a.length;
  const n = b.length;
  // 2 lignes : on n'a besoin que de la précédente pour calculer
  // la courante. Mémoire O(min(m,n)) au lieu de O(m*n).
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,         // insertion
        prev[j] + 1,             // deletion
        prev[j - 1] + cost,      // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Early exit ligne entière > maxDist : aucun chemin futur ne
    // peut donner mieux, on sort.
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Match une query contre un haystack avec tolérance fuzzy.
 *
 * Returns true si :
 *   • La query (normalisée) est ≤ 2 chars : prefix match strict
 *     sur un mot du haystack
 *   • La query est ≥ 3 chars : substring match OU Levenshtein ≤ 1
 *     sur n'importe quel mot du haystack (tolère 1 faute de frappe)
 *
 * Le haystack peut être une string libre (titre, description) ou
 * un mix joint par espaces (ex. concat title + place names + tags).
 * On split par espace pour pouvoir matcher mot par mot — sinon
 * "marais" ne matcherait pas dans "Dimanche au Marais" si Levenshtein
 * était calculé sur la string entière.
 */
export function fuzzyMatch(query: string, haystack: string): boolean {
  const q = normalizeText(query);
  if (q.length === 0) return true; // pas de query = match tout
  const h = normalizeText(haystack);
  if (h.length === 0) return false;

  // Quick win : substring match → toujours OK (cas le plus courant
  // pour une recherche "incrémentale" pendant que l'user tape).
  if (h.includes(q)) return true;

  // Si query trop courte, on n'active pas le fuzzy (trop de bruit).
  if (q.length < 3) {
    // On regarde quand même si un mot du haystack commence par la
    // query (prefix match) — utile pour "br" → "Brunch".
    const words = h.split(/\s+/);
    return words.some((w) => w.startsWith(q));
  }

  // Fuzzy : Levenshtein ≤ 1 sur n'importe quel mot du haystack.
  // Limite à 1 = "1 faute de frappe" (cf. le user "à 1 caractère").
  const words = h.split(/\s+/);
  return words.some((w) => {
    if (w.length < 3) return false; // on ne fuzzy-match pas les mini-mots
    return levenshtein(q, w, 1) <= 1;
  });
}

/**
 * Match une query contre plusieurs haystacks (titre + tags + places).
 * Renvoie true si AU MOINS UN haystack matche.
 */
export function fuzzyMatchAny(query: string, haystacks: (string | undefined | null)[]): boolean {
  const q = normalizeText(query);
  if (q.length === 0) return true;
  return haystacks.some((h) => h && fuzzyMatch(q, h));
}
