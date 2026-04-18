# Proof — Stratégie de monétisation freemium

> Document stratégique interne · version 1.0 · avril 2026
> Basé sur l'état réel du code à la date de rédaction (`src/` ~40 screens, 30+ composants, 16 stores Zustand, stack Expo 52 / RN 0.76 / Firebase / Vercel).

---

## Sommaire

1. [Analyse de l'app existante](#1-analyse-de-lapp-existante)
2. [Stratégie freemium recommandée](#2-stratégie-freemium-recommandée)
3. [Features premium à créer](#3-features-premium-à-créer-spécifiquement)
4. [Améliorations à faire AVANT de lancer le premium](#4-améliorations-à-faire-avant-de-lancer-le-premium)
5. [Pricing](#5-pricing)
6. [Stratégie de conversion](#6-stratégie-de-conversion)
7. [Roadmap d'implémentation](#7-roadmap-dimplémentation)
8. [Risques et points de vigilance](#8-risques-et-points-de-vigilance)
9. [Questions pour Léo](#9-questions-pour-léo)

---

## 1. Analyse de l'app existante

### 1.1 Pitch produit (extrait du code)

**Proof est une app sociale de création et découverte de plans-itinéraires urbains**, actuellement sur **Paris, Londres, Madrid** (`src/constants/cities.ts`). La boucle d'usage centrale :

1. **Je découvre** des plans (Feed / Explore) créés par d'autres users
2. **J'en sauvegarde** certains pour plus tard (`SavesScreen`, tabs todo/done)
3. **Je les fais en vrai** via le mode `DoItNow` (GPS temps réel, détection d'arrivée 50m)
4. **Je valide = je "proof it"** (`Plan.proofCount`, `User.total_proof_validations`)
5. **Je monte en rang** (8 paliers : Ghost 👻 → Top Creator 💎) et **débloque des badges** (36 achievements)
6. **Je crée mes propres plans** avec un wizard 4 étapes (titre → photo → catégories → timeline lieux)

La métrique signature = **Proof count** (rangs calculés dessus dans `src/constants/ranks.ts`). Ce n'est pas une app de "vues" — c'est une app de **validations concrètes**, ce qui est un differentiator fort.

### 1.2 Features actuelles — cartographie par catégorie

| Catégorie | Features implémentées (fichiers) |
|---|---|
| **Découverte** | `FeedScreen` (tab reco + friends), `ExploreScreen` (EXPLORE_GROUPS thématiques, PERSON_FILTERS persona, moods, trending 5-min cache, filtres avancés budget/durée/likes/proofs), `SearchScreen` (plans + users), `ImmersiveCard` (pull-down pour détails) |
| **Création** | `CreateScreen` wizard 4 étapes (titre, photo cover, catégories, timeline lieux avec PRIX/DURÉE/transport/custom photo/comment/questions), drafts auto-save (`draftStore`), mode organisateur (`OrganizeScreen`) pour plans ad-hoc depuis saved places |
| **Social** | Follows + followers (`friendsService`), friend requests, chat 1:1 (`ChatListScreen`, `ConversationScreen`), partage (`SharePlanSheet`), notifications (15 types) |
| **Map** | `FriendsMapView` (marqueurs amis + lieux sauvegardés), `PlanMapModal` (polylines Google Directions), `SavedPlacesScreen` |
| **Action** | `DoItNowScreen` (navigation GPS, chrono, validation lieu-par-lieu), `ProofSurveyModal` (fin de session), place reviews (`placeReviewService`) |
| **Gamification** | 8 rangs via `ranks.ts` (shimmer sur Top Creator), 36 badges via `achievements.ts` (plans/social/places/special), XP + coins + levels dans `User` type, `FounderBadge` exclusif, streaks (`streak_count`), `RankProgressBar` |
| **Profil** | `ProfileScreen` (grid 3 col, stats, badges, pinned plans), `OtherProfileScreen`, `ArchivesScreen`, `EditProfileScreen` |
| **Onboarding / guest** | `GuestSurveyScreen` (ville + intérêts), `AccountPromptModal` (bloque like/save/comment/create en guest), `OnboardingScreen` |
| **i18n / settings** | EN/FR (`i18n/`), `LanguageStore`, `SettingsScreen`, `PrivacySettingsScreen` (isPrivate flag), notifications settings |

### 1.3 Core value gratuite (NE DOIT PAS bouger)

Sur une app sociale, le **paywall cassant** est l'erreur mortelle. Si on veut que Proof atteigne la masse critique nécessaire à un réseau social (quelques dizaines de milliers de MAU minimum), ces features doivent **rester 100% free, sans limite** :

| Feature | Pourquoi c'est intouchable |
|---|---|
| **Feed, Explore, Search, ImmersiveCard** | Sans découverte gratuite illimitée, aucun viral possible |
| **Liker, commenter, sauvegarder** | Ce sont les signaux sociaux qui font vivre le graphe |
| **Follow / être followed** | Base du réseau ; paywaller ici = tuer la croissance |
| **Partager un plan (share link out)** | Chaque partage = canal d'acquisition gratuit |
| **DoItNow de base** (validation de plan via GPS) | C'est le differentiator de Proof vs Google Maps / Notion |
| **Proof validation (proofCount)** | Boucle de gamification ouverte à tous |
| **Créer au moins N plans / mois** (quota généreux, voir §2.3) | Les creators sont le carburant du réseau |
| **Chat 1:1 standard** | Dans une app sociale, paywaller le chat = suicide |
| **Recevoir des notifications push** | Retention dépend de ça |

### 1.4 Benchmark des apps sociales freemium comparables

| App | Modèle | Prix | Leçons pour Proof |
|---|---|---|---|
| **Snapchat+** | Freemium doux | $3.99/mois · $29.99/an | ~10M abonnés sur 800M MAU = ~1.25% conversion. Features : customisation visuelle (icône app, couleur chat), analytics légères (qui a vu le profil), priority (voir les stories en priorité), badge exclusif. Aucune feature sociale de base paywallée. **Pattern à copier.** |
| **BeReal Premium** (RIP) | Freemium raté | ~$1.99/mois | A essayé de paywaller le "late post" (tard > 2min) et l'historique. Les users l'ont perçu comme punitif → échec. **Leçon : ne jamais paywaller ce qui était gratuit avant.** |
| **Strava Premium** | Freemium activité | $11.99/mois · $79.99/an | Pousse sur l'analytics (segments, training load, heat maps), les recommandations de parcours, la sécurité (live tracking). ~15% de conversion. **Modèle data-driven très applicable à Proof.** |
| **Letterboxd Pro/Patron** | Premium "cinéphile" | $19/an · $49/an | Stats ultra-poussées, pas de pub, import/export. Conversion ~3-4%. **Montre qu'une communauté passionnée paie pour l'obsession de ses données.** |
| **AllTrails+** | Freemium utilitaire | $35.99/an | Offline maps, live check-ins sécurité, wrong-turn alerts, stats. Beaucoup de features "Pro" sont safety/utility. **Le mode hors-ligne = gros value prop voyage.** |
| **Komoot** | Freemium + achats à l'unité | 3.99€/région, 29.99€ lifetime World | Modèle "acheter une région" intéressant pour une app multi-villes comme Proof. |
| **Duolingo Super** | Freemium hard | $6.99/mois · $83.99/an | Pas de pub + hearts illimités. Agressif mais fonctionne car friction tangible. **Pas applicable direct mais leur onboarding de conversion est à étudier.** |

**Take-aways clés** :

1. Sur app sociale, **0 conversion < 1%** quand le paywall touche les features sociales de base
2. **0 conversion ~1-5%** quand le premium vend du **confort, du statut, de l'analytique et de l'utilitaire** (pas de la socialité)
3. **L'early-adopter / "Founder"** existe déjà dans le code Proof (`isFounder` + `FounderBadge`) → levier prêt à activer

---

## 2. Stratégie freemium recommandée

### 2.1 Philosophie générale : "Proof is free. Proof+ is everything else."

**Règle d'or** : le **cœur social de Proof doit rester 100% gratuit pour toujours**. Premium = **confort, statut, data perso, superpower utilitaires** — jamais une feature qui empêche de tisser du lien social.

**Les 3 piliers du Premium ("Proof+") doivent être** :

1. **Pouvoir se révéler** : customisation visuelle forte, badge premium, statut distinctif
2. **Voir plus, plus vite, mieux** : analytics persos, filtres avancés, insights créateur
3. **Faire plus de choses concrètes** : export, mode hors-ligne, multi-ville simultané, power tools Do-It-Now

**Règle anti-suicide** : si un utilisateur free ne peut plus faire ce qui est la raison d'être de l'app (créer, découvrir, valider, interagir), on a déjà perdu.

### 2.2 Quoi basculer en premium (existant)

Features déjà codées qu'on peut **ré-emballer en Proof+** sans les supprimer du free (mais en les limitant) :

| Feature actuelle | Décision | Pourquoi |
|---|---|---|
| Filtres avancés Explore (budget/durée/likes/proofs) | **Version light en free, version complète en Proof+** | Déjà codé dans `ExploreScreen` (ligne ~84). Free = 1 filtre à la fois. Proof+ = combinaisons illimitées + filtres additionnels (par rang créateur, par nombre de places, par durée de trajet). Zéro dev front à faire, juste le gating. |
| FriendsMapView avancée | **Free = marqueurs basiques / Proof+ = heatmap + layers + filtres map** | La vue map est déjà là, on ajoute des couches premium |
| Saved places illimités | **Free = 30 lieux / Proof+ = illimité** | Limite douce ; incite au tri, pas bloquant |
| Drafts plans simultanés | **Free = 2 drafts / Proof+ = illimité** | `draftStore` supporte déjà un array |
| Archives plans | **Free = archives visibles mais pas restaurables / Proof+ = restore + export** | `ArchivesScreen` existe |
| Notifications settings granulaires | **Free = settings par catégorie / Proof+ = par user ou par type très fin** | Déjà structuré dans `NotificationsSettingsScreen` |

### 2.3 Quotas à poser côté free (chiffres cibles recommandés)

| Action | Quota free (mensuel) | Proof+ | Motivation |
|---|---|---|---|
| **Plans créés** | 8 / mois | illimité | Un creator actif fait 2-3 plans/semaine. Le quota free couvre l'usage normal mais accroche les power creators. Il faut tester 10 et 5. |
| **Lieux sauvegardés** | 30 au total | illimité | Tri naturel incité |
| **Drafts en cours** | 2 | illimité | `draftStore` |
| **Historique DoItNow** | 30 derniers jours | illimité + recap annuel | Ancre du premium analytics |
| **Recherches sauvegardées / filtres mémorisés** | 0 | illimité | Nouveauté premium-only |
| **Plans téléchargés offline** | 0 | 10 simultanés | Nouveauté premium-only |
| **Exports (PDF/GPX)** | 0 | illimité | Nouveauté premium-only |

**Attention quotas** : jamais de cap sur les interactions sociales (likes, comments, follows, chat). Les quotas touchent la création/accumulation — jamais la socialité.

### 2.4 Ce qui reste intouchable free — récap explicite

- Feed / Explore / Search / ImmersiveCard : **illimité**
- Like / comment / save : **illimité**
- Follow / être followed / voir les followers : **illimité**
- Chat 1:1 : **illimité et sans throttle**
- Do It Now (session actuelle + validation) : **illimité** (seul l'historique > 30j est premium)
- Proof validations et progression de rang : **illimité**
- Badges : **tous débloquables en free** (sauf éventuels badges cosmétiques Proof+ exclusifs)
- Notifications push : **tous types reçus en free**

---

## 3. Features premium à créer spécifiquement

Pensées pour Proof en se basant sur ce qui est dans le code et ce qui manque. Pour chaque : **dev effort (S/M/L)**, **impact conversion estimé (1-5)**, **phase (quick win / v1 / v2)**.

### 3.1 Tableau récapitulatif

| # | Feature | Pilier | Effort | Impact | Phase |
|---|---|---|---|---|---|
| 1 | **Badge Proof+ animé** (shimmer sur avatar + username) | Statut | **S** | 4 | Quick win |
| 2 | **Thèmes visuels Proof+** (dark terracotta, olive, indigo, etc.) | Customisation | **S** | 4 | Quick win |
| 3 | **App icon customisable** (6 variantes) | Customisation | **S** | 3 | Quick win |
| 4 | **Analytics persos creator** (vues plans, provenance, courbes) | Data | **M** | 5 | v1 |
| 5 | **Filtres avancés Explore illimités** (gating existant) | Utilité | **S** | 3 | Quick win |
| 6 | **Mode offline plans** (download 10 plans pour Do-It-Now hors-réseau) | Utilité | **L** | 5 | v1 |
| 7 | **Export PDF / GPX / Apple Maps** d'un plan | Utilité | **M** | 4 | v1 |
| 8 | **Proof Rewind annuel** (Spotify Wrapped-like : stats, plans favoris, badges, villes) | Statut + data | **M** | 5 | v2 (saisonnier) |
| 9 | **Multi-ville simultané** (free = 1 ville active, Proof+ = bascule instant Paris ↔ Londres ↔ Madrid) | Utilité | **S** | 4 | v1 |
| 10 | **AI trip composer** (décrire en une phrase → plan généré) | Superpower | **L** | 5 | v2 |
| 11 | **Friends map heatmap + filtres avancés** | Data | **M** | 3 | v2 |
| 12 | **Priority in feed friends** (toes plans boostés dans les feeds de tes amis) | Statut | **S** | 2 | v2 |
| 13 | **Historique DoItNow illimité + recap mensuel** | Data | **S** | 4 | Quick win |
| 14 | **Collections de plans** (regrouper plans de plans tiers, type Pinterest board) | Utilité | **M** | 4 | v1 |
| 15 | **Pas de pub** (si l'app en diffuse un jour, sinon skip) | Confort | N/A | 2 | Conditionnel |

### 3.2 Fiches détaillées des 8 features prioritaires

#### 🥇 #1 — Badge Proof+ animé & cosmétique

**Description** : Les abonnés Proof+ ont un **badge distinctif animé** (gradient terracotta → or avec shimmer) qui apparaît :
- À côté de leur username (feed, profil, commentaires, chat)
- Dans le `ImmersiveCard` détail plan (en overlay hero)
- Sur leur `FloatingAvatars`

**Pourquoi ça marche** : Snapchat+ a prouvé que le statut visuel est le #1 driver sur les 16-25 ans. Proof a déjà `FounderBadge.tsx` avec un pattern shimmer doré → copier-adapter.

**Valeur perçue** : se distinguer publiquement sans rien faire de plus que payer = positionnement luxe dans une économie d'attention.

**Dev** : **S** (1-2 jours). Ajouter `user.isPremium`, un nouveau composant `ProofPlusBadge`, inject dans les slots existants.

#### 🥇 #2 — Thèmes visuels Proof+

**Description** : Débloque 4-6 **palettes alternatives** à appliquer sur toute l'app : "Olive", "Indigo", "Midnight", "Sunset", "Forest". En plus de la palette par défaut Cream × Terracotta qui reste pour tout le monde.

**Pourquoi ça marche** : les users veulent **habiter** leur app. Les custom themes sont un des items les plus achetés en in-app partout (Telegram, Snapchat, Arc, etc.).

**Valeur perçue** : haute car tangible chaque seconde d'usage.

**Dev** : **S-M** (2-4 jours). Le fichier `src/constants/colors.ts` est déjà centralisé. Le `useColors()` hook existe. Suffit de l'étendre avec un `themeStore` (existe déjà : `src/store/themeStore.ts`) et d'injecter le choix utilisateur.

#### 🥇 #3 — App icon customisable

**Description** : 6 icônes alternatives téléchargeables (Expo supporte ça via `expo-dynamic-app-icon`). Palette : terracotta classic (free), olive, indigo, gold, monochrome, founder-exclusive.

**Pourquoi ça marche** : Snapchat+ a popularisé ça, c'est un marqueur social fort (les amis voient ton écran d'accueil).

**Dev** : **S** (1 jour). Installer la lib, créer les 6 PNG, logique de switch.

#### 🥈 #4 — Analytics persos créateur

**Description** : Dashboard dédié sur le profil premium :
- **Courbe de vues** de tes plans (7j / 30j / 365j)
- **Top 3 plans** les plus vus / sauvegardés / proofed
- **Provenance** : d'où viennent les saves (feed, explore, search, share link, friend map)
- **Heatmap d'activité** : quand ton audience est active
- **Progression rang** avec projection "à ce rythme tu es Tastemaker dans 23 jours"
- **Badges proches** : "il te manque X pour débloquer Y"

**Pourquoi ça marche** : les creators paient pour voir leur impact. Letterboxd Pro, Strava, YouTube Studio — tous ont construit leur premium dessus.

**Dev** : **M** (5-8 jours). Il faut **instrumenter les vues de plans** (PostHog `trackEvent` existe déjà → événements à ajouter), écrire les agrégations (Firebase functions ou query Firestore avec index), UI de dashboard (~2 jours).

**Pré-requis** : Firebase Analytics / PostHog funnel déjà en place (✅).

#### 🥈 #5 — Mode offline plans (Download for Do-It-Now)

**Description** : En Proof+, possibilité de **télécharger jusqu'à 10 plans** en local. Inclut : places + photos + map tiles autour des points + les travelSegments.

Le mode DoItNow fonctionne alors **sans réseau** : critique pour le voyage (métro, Londres/Madrid, itinérance data expensive).

**Pourquoi ça marche** : AllTrails+, Komoot et Google Maps gratuits ne font PAS ça pour les itinéraires composés → gros différenciateur.

**Valeur perçue** : très haute en contexte voyage.

**Dev** : **L** (2-3 semaines). Stocker en SQLite/AsyncStorage, préfetch photos + tiles, adapter `DoItNowScreen` pour fallback local, UI de gestion downloads.

#### 🥈 #6 — Export PDF / GPX

**Description** : Exporter un plan :
- **PDF** joli format éditorial (utile partage IRL, itinéraires imprimés pour famille)
- **GPX** importable dans Garmin, Komoot, Strava
- **Apple Maps / Google Maps** deeplink vers l'itinéraire complet

**Pourquoi ça marche** : les power users de voyage veulent du contrôle sur leurs données. C'est aussi un argument pour les créateurs "pro" qui vendent leurs plans comme guides.

**Dev** : **M** (1 semaine). Lib PDF native React Native (`react-native-html-to-pdf`), générateur GPX trivial (XML).

#### 🥈 #7 — Proof Rewind annuel

**Description** : Fin décembre, chaque user Proof+ débloque un **Wrapped annuel stylé** :
- Nombre de plans créés / faits / sauvegardés
- Top 3 villes
- Badges débloqués cette année
- Progression rang (départ → arrivée)
- Plan signature (le plus populaire)
- Heure / jour préféré de création
- Personnage que tu es ("Solo rider", "Squad goals", etc. basés sur les mood tags)

Screenshotable + shareable sur stories (instagram/tiktok).

**Pourquoi ça marche** : Spotify Wrapped a transformé la conversion en décembre. Même logique applicable.

**Dev** : **M** (2 semaines, saisonnier). On peut le pousser hors saison avec un "Proof Rewind mensuel" en v2.

**Viralité** : chaque partage devient une pub gratuite pour Proof+.

#### 🥈 #8 — AI Trip Composer

**Description** : "Décris un moment en une phrase — on te compose un plan."

> "Un dimanche cosy à Paris pluvieux pour un couple qui aime le café et les vieux films."

→ L'IA génère un plan de 3-5 lieux cohérents (café → cinéma rétro → dîner) en utilisant le catalogue de places déjà indexées + des templates.

**Pourquoi ça marche** : c'est un **Wow moment** puissant. Et ça compense le travail de création pour les users qui ne sont pas créateurs.

**Dev** : **L** (3-4 semaines). Nécessite :
- Un catalogue de places enrichi (potentiellement via Google Places + annotations)
- Un prompt engineering Claude API
- Backend d'assemblage (Vercel function) avec filtres de cohérence géographique

**ROI** : c'est le **signature feature premium** qui justifie à lui seul le prix pour pas mal d'utilisateurs.

---

## 4. Améliorations à faire AVANT de lancer le premium

Un paywall au-dessus d'un produit fragile tue le produit. Ces améliorations doivent être en place avant même de commencer à dev le premium.

### 4.1 Polish du produit gratuit

| Zone | Problème actuel | À faire |
|---|---|---|
| **Onboarding guest** | `GuestSurveyScreen` demande ville + intérêts mais l'experience après est identique pour tous | Personnaliser le feed initial : si "solo" + "Paris" + "productive", afficher 5 plans pertinents dès la home |
| **AccountPromptModal** | S'affiche systematiquement, copy générique "Rejoins Proof." | Contextualiser : "Crée un compte pour sauvegarder ce plan que tu aimes" (accrocher au contenu spécifique que l'user vient de tenter) |
| **`mockApi.ts` résidus** | Il y a encore du mock en prod (vu `coins: 180` dans `src/services/mockApi.ts`) | Migrer à 100% Firestore, supprimer le mock |
| **Coins non-implémentés** | `User.coins` existe, `CoinsPill` existe, mais **jamais gagnés ou dépensés nulle part** → confusion | Soit activer une vraie boucle gagne/dépense (cadeaux, boosts), soit retirer temporairement |
| **Dark mode** | Tokens prévus mais thème uniquement cream actuellement | Vrai dark mode terracotta "Midnight" prêt pour tous → puis variations dark en premium |
| **`achievements.ts` badges non-trackés** | `recreated`, `comeback_kid`, `first_in_city` sont déclarés mais pas trackés | Implémenter le tracking (sinon users bloqués sur badges fantômes) |

### 4.2 Points de friction actuels à corriger

1. **Filter la city par défaut** : un user parisien qui swipe Explore voit des plans Londres/Madrid mélangés → implémenter un filtre city-sticky
2. **Rangs confus** : 8 rangs c'est peut-être trop pour un user débutant. Montrer uniquement les 3 suivants dans la UI
3. **Pas de notif "qq un a proof it ton plan"** : c'est pourtant le compliment ultime dans Proof
4. **Chat non-persistant** : vérifier offline support
5. **Wizard création step 4 (timeline)** : fraîchement refondu ✅ mais pas encore testé en prod

### 4.3 Instrumentation analytics à compléter

Pour que Proof+ puisse afficher des "Analytics persos" de qualité, il faut **logger dès maintenant** (et rétroactivement dans le feed existant) :

- `plan_viewed` (avec source : feed / explore / search / share_link / friend_map / profile)
- `plan_detail_opened`
- `plan_do_it_now_started` / `do_it_now_completed`
- `place_viewed_in_plan`
- `follow_from_plan`

PostHog est déjà configuré (`src/services/posthogConfig.ts`, `trackEvent` utilisé dans `CreateScreen`). **Étendre à tous les screens clés** avant de lancer le premium.

### 4.4 Moments clés pour teaser le premium

Dans le flow gratuit actuel, voici les points où un teaser premium aurait du sens (à coder AVANT le lancement premium — squelette prêt pour quand le paywall arrive) :

1. Fin de `DoItNowCompleteScreen` → "Veux-tu voir toutes tes stats d'année ?"
2. `ProfileScreen` → slot vide "🎨 Change your theme" en haut
3. `ExploreScreen` filtres avancés → "Débloquer +3 filtres"
4. `ArchivesScreen` → "Exporter vos archives"
5. Quand user a créé 7 plans (à 1 du quota 8) → "Débloquer la création illimitée"

---

## 5. Pricing

### 5.1 Benchmark des prix (rappel)

| Produit | Prix mensuel | Prix annuel | Discount annuel |
|---|---|---|---|
| Snapchat+ | $3.99 | $29.99 | 37% |
| Strava | $11.99 | $79.99 | 44% |
| AllTrails+ | — | $35.99 | — |
| Duolingo Super | $6.99 | $83.99 | 0% |
| Letterboxd Pro | — | $19 | — |
| Letterboxd Patron | — | $49 | — |
| YouTube Premium | $13.99 | — | — |

### 5.2 3 scénarios de prix pour Proof+

| Scénario | Mensuel | Annuel | Discount | Positionnement |
|---|---|---|---|---|
| **A — Doux / mass** | **3,99 €** | **29,99 €** | **38%** | Snapchat+ clone : accessible, large base, conversion élevée (cible 3-5%), ARPU faible |
| **B — Sweet spot** ⭐ recommandé | **4,99 €** | **39,99 €** | **33%** | Meilleur trade-off valeur/prix pour une app "lifestyle social" à features denses |
| **C — Premium / niche** | **7,99 €** | **59,99 €** | **38%** | Positionnement creator/voyage sérieux. Moins de conversion mais ARPU fort |

**Pourquoi je recommande B (4,99€/mois, 39,99€/an)** :

- Au-dessus de Snapchat+ = perçu "plus complet"
- En dessous de Strava = perçu "accessible"
- Le palier 4,99€ a un effet psychologique "presque 5€" mais sous la barre
- 39,99€/an = équivalent 3,33€/mois = économie tangible qui incite au shift annuel (meilleur pour le cashflow / churn)

### 5.3 Offre de lancement

**Founders Lifetime** (premiers 1 000 abonnés) :

- **49,99 €** **à vie** — pas d'abonnement récurrent
- Upgrade automatique du `User.isFounder` flag existant → shimmer Founder + badge Proof+ combinés
- Quantité limitée, vendus au lancement seulement
- **Messaging** : "Les 1 000 premiers qui croient en Proof."

**Pourquoi c'est malin** :

- Génère **50 000 € cash-in en 1 shot** (acceptable pour un early-stage)
- Crée une cohorte ambassadrice **ultra-loyale** (ils ont payé, ils pushent)
- Le badge combiné Founder+Premium devient un status symbol
- Limite le risque financier long terme (pas de monthly à vie pour des milliers)

**Offre annuelle "Early Adopter"** (ensuite, 3 mois) :

- **29,99 € / an** (au lieu de 39,99 €, soit 25% off)
- Durée limitée : 3 premiers mois après le Founders Lifetime
- Visible partout : banner in-app + pages de teasers

**Offre étudiante** (évergreen) :

- **29,99 € / an** sur vérification edu (via service tiers type UNiDAYS)
- Cible 18-24 ans qui sont la core audience de Proof

### 5.4 Projection revenu — 3 hypothèses de conversion

**Hypothèses de base** :
- 10 000 MAU (Month Active Users) à 6 mois post-lancement
- Prix moyen pondéré annuel : 33€ (~80% annuel + 20% mensuel sur 12 mois)

| Conversion | Abonnés Proof+ | MRR (€) | ARR (€) | Notes |
|---|---|---|---|---|
| **1% (pessimiste)** | 100 | ~275 | **~3 300** | Si premium trop light, mauvaise exécution paywall |
| **3% (cible)** | 300 | ~825 | **~9 900** | Cible réaliste app sociale premium bien executé |
| **5% (optimiste)** | 500 | ~1 375 | **~16 500** | Strava level — nécessite hook retention très fort |

**Avec Founders Lifetime en one-shot** :
- +50 000 € cash-in si sold-out → couvre 15 mois de dev à un salarié senior ou 2-3 freelances
- Game-changer pour la runway early-stage

**À 100 000 MAU (12-18 mois si croissance)** :
- 3% conversion = 3 000 abonnés = **~99 000 € ARR**
- 5% conversion = 5 000 abonnés = **~165 000 € ARR**

---

## 6. Stratégie de conversion

### 6.1 Où placer les paywalls dans le user flow

Principe : **teaser soft partout, paywall dur seulement là où le user ressent le manque spécifique**. Jamais en plein milieu d'une action sociale.

| Emplacement | Type | Comportement |
|---|---|---|
| `ProfileScreen` en haut | **Banner persistant** (si non-premium) | "Passe en Proof+ · thèmes, analytics, offline" avec dismiss option |
| `ExploreScreen` filtre avancé après 1er | **Paywall modal soft** | "Débloquer tous les filtres · 3,99€/mois". Bouton "Non merci" bien visible |
| `ArchivesScreen` Export button | **Paywall modal dur** | Click direct → paywall. Feature premium-only. |
| Création 9ème plan du mois | **Modal quota atteint** | "Tu as tout déchiré ! 8/8 plans ce mois. Passe en Proof+ pour créer sans limite." Le plan n'est pas perdu → enregistré en draft. |
| Fin de `DoItNowCompleteScreen` | **Upsell contextuel** | "Voir tes stats du mois · Proof+" |
| Settings > Apparence | **Teasers visuels** | Tous les thèmes visibles, les premium ont un petit cadenas 🔒, tap → paywall |
| Après création 5ème plan (lifetime) | **One-time offer** | Popup once-only : "Tu es un creator Proof → -50% sur ton 1er mois" |

**Paywall jamais à** : feed, like, comment, save, follow, chat, Do It Now (mode live), accueil, onboarding initial.

### 6.2 Trigger events pour pousser le premium

**Événements "tu gagnerais à être premium"** à brancher sur le trackEvent PostHog :

| Trigger | Message premium |
|---|---|
| User a sauvegardé 20+ lieux | "Tu collectionnes bien ! Organise en collections avec Proof+" |
| User vient de valider son 10ème Proof | "Tu es un habitué. Débloque ton historique complet" |
| User a rank up | "Célèbre ton rang avec un thème exclusif 🎨" |
| User voyage (city switch détecté) | "Télécharge tes plans offline avant ton voyage" |
| User reçoit 50+ likes cumulés | "Vois qui a aimé tes plans avec les Analytics Proof+" |
| User crée son 5ème plan | "Tu es creator ! Profile pro dans Proof+" |
| Décembre | "Ton Proof Rewind 2026 arrive. Abonne-toi pour le recevoir en entier." |

### 6.3 Free trial ou pas ?

**Recommandation : Oui mais court. 7 jours, sans carte requise au début (paywall soft seulement)**.

Pourquoi :
- Les users ne peuvent pas deviner la valeur des thèmes / analytics / offline sans les utiliser
- 7 jours = assez pour créer une habitude sur 1-2 plans et toucher aux features
- Conversion post-trial typique app sociale : 15-25%

**Pattern recommandé** :
1. User hit paywall (ex : demande un export PDF)
2. Modal : "Essaie Proof+ gratuit 7 jours — aucune carte requise maintenant"
3. User dit oui → accès complet 7 jours (sans CB)
4. Jour 5 → notif "Plus que 2 jours. Voici ce que tu perdras"
5. Jour 7 → modal "Garde Proof+ pour 4,99€/mois" (là on demande CB)

Ce pattern "no card required" est celui de Duolingo et Headspace récents — beaucoup moins de friction, meilleurs taux de tap sur le trial, et ceux qui convertissent sont plus qualifiés.

### 6.4 Teasers gratuits visibles partout

Pour que les free users soient toujours "à deux doigts de sauter", il faut qu'ils **voient régulièrement Proof+** sans se sentir harcelés :

- **Avatars/badges Proof+** de leurs amis qui deviennent premium → signal social fort
- **Sections "Features Proof+"** en bas des settings (encart subtil)
- **Compteur "X / 8 plans ce mois"** sur le Profile → transforme le quota en objet visuel
- **"Themes préview"** disponible en read-only dans Settings même pour free
- **"Insights preview"** : 1 seule stat visible en free ("Tes plans ont été vus X fois") + "Voir tous les insights → Proof+"

**Principe UX** : le free user doit **voir** ce qu'il pourrait avoir mais ne pas le subir comme une perte. C'est ce que Snapchat+ fait très bien avec les "coming soon features".

---

## 7. Roadmap d'implémentation

### 7.1 Ordre recommandé

**Phase 0 — Préparation (2 semaines, AVANT tout dev premium)** :
- [ ] Polish : AccountPromptModal contextuel, mockApi.ts cleanup, badges fantômes fixés
- [ ] Instrumentation analytics complète (tous les `trackEvent` clés)
- [ ] Dark mode "Midnight" pour tous
- [ ] Onboarding guest personnalisé

**Phase 1 — MVP Premium (3-4 semaines)** :
- [ ] Intégration **RevenueCat** + abonnements in-app (iOS + Android + Stripe web)
- [ ] Flag `user.isPremium` + sync RevenueCat → Firestore
- [ ] Paywall modal component réutilisable (+ A/B test entre 2 copies)
- [ ] **Feature 1 — Badge Proof+ animé** partout
- [ ] **Feature 2 — Thèmes visuels** (4-6 themes)
- [ ] **Feature 5 — Filtres Explore unlocked**
- [ ] **Feature 13 — Historique DoItNow illimité**
- [ ] Founders Lifetime offer (50k€ one-shot goal)
- [ ] 7-day trial sans CB

**Phase 2 — v1 Premium (6-8 semaines)** :
- [ ] **Feature 4 — Analytics persos creator dashboard**
- [ ] **Feature 6 — Mode offline plans**
- [ ] **Feature 7 — Export PDF / GPX**
- [ ] **Feature 3 — App icon customisable**
- [ ] **Feature 9 — Multi-ville simultané**
- [ ] **Feature 14 — Collections de plans**

**Phase 3 — v2 Premium (8-12 semaines)** :
- [ ] **Feature 8 — Proof Rewind annuel** (à timer pour décembre)
- [ ] **Feature 10 — AI Trip Composer**
- [ ] **Feature 11 — Friends map heatmap**

### 7.2 Stack technique recommandé

| Besoin | Recommandation | Pourquoi |
|---|---|---|
| **Subscription management mobile** | **RevenueCat** (free jusqu'à $2.5k MRR) | Gère iOS/Android/Stripe, webhooks, analytics, A/B testing, receipt validation. Compatible Expo. |
| **Web payment (si support web)** | Stripe + RevenueCat SDK web | Déjà en prod sur Vercel |
| **Feature gating** | Flag simple `user.isPremium` + `useIsPremium()` hook | Pas besoin de plus complexe au début |
| **Analytics premium funnel** | PostHog déjà en place | Événements `paywall_shown`, `trial_started`, `trial_converted`, `subscription_cancelled` |
| **Download offline** | AsyncStorage + SQLite (`expo-sqlite`) pour metadata, FileSystem pour photos/tiles | Natif Expo |
| **PDF export** | `react-native-html-to-pdf` | Le plus mature |
| **Push notifs premium** | expo-notifications déjà en place | Juste segmenter les audiences |
| **AI (Trip Composer)** | Claude API via Vercel function (pattern déjà utilisé pour places) | Réutilise l'infra |

### 7.3 Estimation temps MVP premium

**Solo dev senior : ~4-6 semaines** pour Phase 1 (MVP payable).

Décomposition :
- Intégration RevenueCat + flag + paywall component : 1 semaine
- Badge Proof+ + Thèmes : 3-4 jours
- Filtres + historique unlocked (gating sur code existant) : 2 jours
- Founders Lifetime offer + landing : 3 jours
- Trial logic + A/B test copy : 1 semaine
- Polish + test + dogfood : 1 semaine

**Coût externe (si freelance) : ~15-25k€** pour phase 1 qualité prod.

---

## 8. Risques et points de vigilance

### 8.1 Risques spécifiques app sociale

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **Paywall tue la croissance** | Haute si mal placé | Mortel | Zéro paywall sur features sociales (like/comment/follow/chat). Rester strict sur la ligne "social = free". |
| **Les creators désertent** | Moyenne | Fort | Proof+ doit **récompenser** les creators, pas les punir. Offrir 1 mois gratuit à tout user ayant créé 10+ plans à vie. |
| **Perception "BeReal Premium"** (pay pour rattraper une feature gratuite cassée) | Basse si exécuté proprement | Mortel pour image | Ne JAMAIS paywaller une feature qui était free. Ajouter, pas soustraire. |
| **Rage des Early users** | Moyenne | Fort | Compenser les users actifs pré-premium : tous les users ayant 20+ Proofs au lancement reçoivent 3 mois gratuits. |
| **Concurrence de Notion / Google Maps / Komoot** avec features similaires | Moyenne | Moyen | Se différencier sur le **social + proof validation**, pas sur les features utilitaires pures. |
| **Apple/Google prennent 30%** | Certaine | Modéré | Stripe sur web (option "s'abonner via web" dans settings) pour ~97% de retention du cash |
| **Non-conformité RGPD / App Store** | Moyenne | Mortel court terme | Consulter un avocat EU avant lancement (particulièrement sur données perso dans Analytics + auto-renew terms) |

### 8.2 Comment éviter de tuer la croissance organique

**Règle absolue** : tant que Proof n'a pas atteint **~50 000 MAU**, toute feature qui risque de réduire le partage organique (likes, shares, saves) doit rester 100% free. Ce seuil est le **point critique réseau social** en dessous duquel la monétisation est prématurée.

Mesures protectrices :

- **Invite loop free** : inviter un ami qui s'abonne = 1 mois gratuit Proof+ (pattern Strava, Robinhood)
- **Partage d'un plan Proof+ à un user non-premium** : le plan reste visible (pas de "plan réservé aux premium", jamais)
- **Tous les plans sont dans tous les feeds** : un user premium n'a pas un feed différent (sauf options de filtres customs)
- **Les notifications sociales restent toutes gratuites** : likes/comments/proofs notifiés à tous
- **Observer le taux de follow-per-user** avant/après lancement : si ça chute, le premium a cassé quelque chose

### 8.3 KPIs à tracker (tableau de bord post-lancement)

| KPI | Cible 3 mois | Cible 6 mois | Pourquoi |
|---|---|---|---|
| **MAU free** | ≥ +20% MoM | ≥ +15% MoM | Le premium ne doit pas ralentir la croissance |
| **Conversion premium (% des MAU)** | 1-2% | 3% | Benchmark app sociale |
| **Trial → paid rate** | ≥ 15% | ≥ 20% | Si < 10%, revoir l'onboarding trial |
| **Churn mensuel premium** | ≤ 8% | ≤ 5% | Signal santé du premium |
| **Plans créés par user premium / free** | Ratio > 1.5× | > 2× | Confirme que les power users convertissent |
| **DAU / MAU ratio** | ≥ 20% | ≥ 30% | Engagement global, à surveiller |
| **Taux de partage plan (shares / plan créé)** | ≥ 0.3 | ≥ 0.5 | Viralité organique |
| **Paywall shown → tap rate** | 5-10% | 8-15% | Efficacité du paywall |
| **Paywall tap → trial start** | ≥ 40% | ≥ 50% | Friction de start |
| **Annual vs monthly mix** | ≥ 60% annual | ≥ 70% annual | Annual = retention, meilleur pour cashflow |
| **NPS des premium** | ≥ 50 | ≥ 60 | Critique — des premiums mécontents détruisent la réputation |

### 8.4 Signaux d'alerte rouge

Si un de ces signaux se déclenche, **geler le rollout premium** et investiguer :

- MAU free en baisse 2 mois consécutifs → paywall trop agressif, reculer
- Churn premium > 15%/mois → la valeur perçue n'est pas au rendez-vous
- Reviews App Store baisse de > 0.5 étoile en 30j → perception négative
- Taux de création de plans en baisse > 20% → le quota 8/mois est peut-être trop bas
- Support tickets mentionnant "trop cher / pas utile" > 30% → revoir pricing ou features

---

## 9. Questions pour Léo

Pour affiner la stratégie, j'ai besoin de ces informations que je ne peux pas déduire du code :

### Produit

1. **"Feeds Exhibit et Alibi" mentionnés dans ta demande** — je n'en trouve aucune trace dans le code. Est-ce :
   - Un projet parallèle ?
   - Une vision future pour Proof que tu aimerais voir apparaître ?
   - Un renommage interne prévu des feeds actuels (reco / friends) ?
   - Une confusion avec une autre app ?
   
   → **Ça change énormément la stratégie** : si Exhibit/Alibi sont des concepts à intégrer, on a 2-3 features supplémentaires à penser.

2. **Mission-moat** : quelle est ta conviction sur le **différentiateur de Proof** vs Google Maps Lists, Notion, Komoot, TripAdvisor ? Si c'est le "social + proof validation", je recommande de focus 80% du premium sur le statut/social. Si c'est le "creator economy voyage", je pivote vers creator tools.

3. **Objectif business 12 mois** : viabilité solo, lever des fonds, sortir cash ?

### Business

4. **Current MAU / DAU** ?

5. **Target MAU 12 mois** ?

6. **Coûts mensuels actuels** (Firebase, Vercel, Google Places API est cher, Mapbox éventuel) ? → impact sur le break-even du premium

7. **Monétisation alternative envisagée ?** (ads, B2B partenariats lieux, commissions bookings…) Le premium ne doit pas être le seul levier.

### Stratégique

8. **Budget dev disponible** : solo / 1 freelance / team ? → impacte la phase ordering et la priorisation features

9. **Ville focus** : Paris-only au début ou push immédiat multi-villes ?

10. **Ambition géographique** : rester Europe ou viser US/Asie ? (change complètement le pricing et la stratégie)

11. **Audience cible prioritaire** : Gen Z 18-24 (Snapchat+ price), Millennials 25-35 (Strava price), creators/ambassadeurs ?

12. **B2B envisagé ?** : partenariats avec restos/bars (featured plans payés), marques tourisme, offices de tourisme ? Un Proof Business serait à penser différemment.

### Tech / Légal

13. **RevenueCat déjà été utilisé ?** Account existant ? Acceptation sur les deux plateformes ?

14. **Personne juridique** : SAS France ? → détermine le setup Apple/Google developer accounts et la TVA

15. **Conformité RGPD actuellement** en place ? Politique de confidentialité rédigée ?

---

**Document rédigé le 17 avril 2026 · à réviser après réponses aux questions ci-dessus et après les premiers A/B tests post-lancement.**
