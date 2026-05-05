/**
 * Banques de suggestions éditoriales — affichées comme inspirations
 * cliquables sous les inputs de plan (titre, conseil créateur, etc.).
 *
 * Chaque thème stocke ~50 phrases. À l'usage, `pickRandomSuggestions`
 * retourne N items aléatoires sans répétition. La sélection est
 * re-randomisée à chaque mount du composant qui la consomme — l'user
 * voit donc 3 idées différentes à chaque ouverture du wizard.
 *
 * Pour ajouter / éditer :
 *   • Garder le ton éditorial Proof : phrases courtes, française,
 *     personnelles, jamais clichées.
 *   • Pas de duplication : check rapide avant d'ajouter une variante
 *     proche d'une existante.
 *   • Maintenir ~50 par thème pour que les 3 du jour aient une vraie
 *     variabilité (statistiquement, peu de chances de re-voir les
 *     mêmes 3 à la prochaine ouverture).
 */

// ══════════════════════════════════════════════════════════════
// THEME : title — titres de plan (CreateScreen step 1) + journée
//   (OrganizeScreen step 1)
// ══════════════════════════════════════════════════════════════

export const TITLE_SUGGESTIONS: string[] = [
  // Mood + lieu
  'Dimanche parfait à Belleville',
  'Soirée intimiste dans le 11e',
  'Brunch & shopping au Marais',
  'Journée culture au Marais',
  'Brunch dominical tranquille',
  'Sortie cocooning à deux',
  'Pause nature dans Paris',
  'Coup de chaud dans le 9e',
  'Ma version de Pigalle',
  'Saint-Germain en mode slow',
  'Une journée à Belleville',
  'Le 10e côté canal',
  'Bastille comme avant',
  'Mon coin tranquille à Montmartre',
  'Échappée à Bastille',

  // Activité dominante
  'Marche & musées en boucle',
  'Café-flânerie-livre',
  'Apéro long et vue dégagée',
  'Brunch sans réveil',
  'Resto-cinéma classique',
  'Soir de match entre potes',
  'Date qui démarre par un musée',
  'Friperies et sandwich grec',
  'Marché du dimanche, café, bouquinerie',
  'Bar-à-vins puis dancefloor',

  // Concept / vibe
  'Mon Paris en mode contemplatif',
  'Première date qui claque',
  'Quand on a 3h pour bien faire',
  'Mes lieux de retour systématique',
  'Le truc qu\'on refait toujours',
  'Cap ou pas cap, version urbaine',
  'Pour les jours sans pression',
  'Un dimanche qui se prolonge',
  'Soirée loin du bruit',
  'Le plan qui marche à tous les coups',

  // Météo / saison
  'Quand il pleut un samedi',
  'Le premier jour de printemps',
  'Été indien à 18h',
  'Décembre, lumières, glühwein',
  'Canicule, on cherche l\'ombre',

  // Format temporel
  '2h pile entre deux rendez-vous',
  'Une demi-journée bien remplie',
  'Rendez-vous fin d\'aprèm',
  'Soirée qui dérive jusqu\'à minuit',
  'Vendredi soir réservé',

  // Référentiel précis
  'Fin de journée vers Bastille',
  'Le tour du Canal Saint-Martin',
  'Buttes-Chaumont sans GPS',
  'Petits musées du 5e',
  'Saint-Paul, en bouclant',
];

// ══════════════════════════════════════════════════════════════
// THEME : creator_tip — conseil signature du créateur en fin de
//   wizard de création (CreateScreen step 5 / customize step 3 /
//   CoPlanPublishScreen step 4)
// ══════════════════════════════════════════════════════════════

export const CREATOR_TIP_SUGGESTIONS: string[] = [
  // Timing
  'Le meilleur moment, c\'est vers 18h quand la lumière est dingue',
  'Vas-y avant 11h, tu as la salle pour toi',
  'Mieux vaut y aller un mardi qu\'un samedi',
  'À la tombée du jour, c\'est magique',
  'Évite le créneau 13h-14h, c\'est saturé',
  'Le dimanche matin avant midi, c\'est calme et beau',
  'Tape vers 17h, tu chopes la golden hour',
  'Démarre tôt, finis tard — ça vaut le coup',
  'Le secret, c\'est d\'y aller en semaine au coucher du soleil',
  'Vas-y un jeudi soir, l\'ambiance est différente',

  // Hack lieu
  'Demande le menu caché au bar, ils ont des plats non listés',
  'Réserve la table du fond, c\'est la plus intime',
  'Au comptoir, tu paies moins et t\'as l\'animation',
  'Demande à être en mezzanine, vue imprenable',
  'Le plat du chef n\'est pas à la carte, demande-le',
  'Côté cour, pas côté rue — beaucoup plus calme',
  'En terrasse couverte si tu hésites, c\'est l\'idéal',
  'Choisis la table près de la fenêtre côté ouest',
  'Demande un siège près du bar, le show est meilleur',
  'Va au sous-sol, c\'est là que ça se passe',

  // Stratégie réservation / file
  'Réserve dès l\'ouverture, ça part vite',
  'Pas besoin de réserver avant 19h en semaine',
  'Arrive 15 min avant, sinon t\'es à la rue',
  'Si c\'est complet, va voir le bar voisin, même cuisine',
  'Le walk-in marche bien le mardi soir',
  'Réserve juste pour le dîner, pas pour l\'apéro',

  // Ce qu\'il faut commander / éviter
  'Prends le menu du jour les yeux fermés',
  'Skip la carte, va sur les ardoises',
  'Le tiramisu, vraiment. Crois-moi',
  'Ne pars pas sans goûter le café',
  'Demande la pâtisserie qui n\'est pas en vitrine',
  'Le cocktail signature, c\'est une tuerie',
  'Le pain maison se garde pour la fin',

  // Ambiance / vibe
  'Va-y avec quelqu\'un qui sait écouter, pas parler',
  'Apporte un livre, tu vas y rester 2h',
  'Mets un truc confortable, on s\'éternise',
  'Pas de musique forte, parfait pour un vrai date',
  'Tu peux y rester 3h sans qu\'on te bouscule',
  'L\'endroit pour les conversations qui comptent',

  // Détail pratique
  'Ils acceptent les cartes mais le cash débloque les bonus',
  'Pas trop de bruit, tu peux entendre l\'autre',
  'Wi-fi nul mais peu importe, t\'es là pour autre chose',
  'Garde une heure de marge pour traîner après',
  'Pense à passer aux toilettes du 1er, design ouf',

  // Anecdote / personnalité
  'Le patron raconte des trucs si tu le lances',
  'Si t\'as de la chance, le serveur te chante un truc',
  'C\'est minuscule, prends ça pour un signe',
  'L\'odeur quand tu rentres — toute la journée tient là',
  'Ferme les yeux à la première gorgée',
];

// ══════════════════════════════════════════════════════════════
// THEME : place_comment — commentaire personnel sur un lieu
//   (sheet de personnalisation du lieu, étape de fin de Do It Now)
// ══════════════════════════════════════════════════════════════

export const PLACE_COMMENT_SUGGESTIONS: string[] = [
  // Servi / accueil
  'Servi avec le sourire, fauteuils confortables',
  'Accueil chaleureux, on se sent à la maison',
  'Le serveur s\'est souvenu de mon dernier passage',
  'Ambiance posée, personne ne te presse',
  'Le patron prend le temps, ça change tout',
  'Service rapide même quand c\'est plein',

  // Cuisine / qualité
  'Petite carte mais tout est juste',
  'Produits frais, ça se sent à la première bouchée',
  'Pas révolutionnaire mais ultra-réconfortant',
  'Mieux que ce que la déco laisse penser',
  'Le chef sort de la cuisine, signe que c\'est sérieux',
  'Cuisson parfaite, j\'y reviens demain',
  'Portions correctes, prix honnête',

  // Décor / espace
  'Lumière tamisée, parfait pour discuter',
  'Le canapé près de la fenêtre, mon spot',
  'Petite cour intérieure, surprise totale',
  'Plafond haut, ça respire',
  'Pas le plus beau mais l\'âme est là',
  'Mezzanine pour deux, à privatiser',

  // Bruit / vibe
  'L\'ambiance jazz, parfaite pour un rendez-vous',
  'Pas trop bruyant, on s\'entend parler',
  'Soir de match, ça hurle, mais bon esprit',
  'Calme à 14h, animé à 19h — choisis ton créneau',
  'Le brouhaha rassurant des bons restos',

  // Avis nuancé / honnête
  'Pas exceptionnel mais ça fait le job',
  'Bon mais cher pour ce que c\'est',
  'À tester une fois, pas deux',
  'Mieux que la moyenne du quartier',
  'Sans surprise, c\'est ce qu\'on cherchait',
  'Surcoté à mon goût, mais à toi de voir',

  // Conseil pratique
  'Évite les soirs de week-end, c\'est blindé',
  'Réservation hautement recommandée',
  'Va-y le matin, c\'est une autre planète',
  'En semaine, tu peux improviser',

  // Personnel / souvenir
  'Mon point de chute préféré du quartier',
  'On y est restés 3h sans voir le temps passer',
  'Première fois ici, pas la dernière',
  'Ça m\'a rappelé un café à Lisbonne',
  'L\'odeur en entrant — tout est dit',
  'Le café à la fin valait à lui seul le détour',

  // Météo / saison
  'En terrasse au printemps, parfait',
  'L\'hiver, le lieu prend tout son sens',
  'Bon spot pluie, lumière chaude dedans',

  // Apéro / cocktail / café
  'Cocktail signature à tester absolument',
  'Le café est sérieux, ça compte',
  'Cave naturelle, le sommelier sait conseiller',
  'Apéro qui se prolonge facile',
  'La bière locale en pression, mention spéciale',
];

// ══════════════════════════════════════════════════════════════
// Helper — pick N items au hasard, sans répétition
// ══════════════════════════════════════════════════════════════

/**
 * Retourne `count` éléments distincts choisis au hasard depuis le
 * tableau passé. Si `count >= source.length`, retourne le tableau
 * complet shuffle. Algorithme : Fisher-Yates partial shuffle (O(count)
 * plutôt qu'O(n) — efficace même quand source est large).
 *
 * Utilisation classique :
 *   const ideas = useMemo(() => pickRandomSuggestions(TITLE_SUGGESTIONS, 3), []);
 * → re-randomise à chaque mount du composant.
 */
export function pickRandomSuggestions(source: string[], count: number = 3): string[] {
  if (source.length === 0 || count <= 0) return [];
  if (count >= source.length) {
    // Shuffle complet quand on demande tout (pas de slice nécessaire)
    const copy = [...source];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  // Partial Fisher-Yates : on échange seulement count fois
  const copy = [...source];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
    out.push(copy[i]);
  }
  return out;
}
