# Proof — Polices à uploader

> Document à remettre à Claude Design (ou à n'importe quel outil / designer) pour setup les typographies du projet Proof.
>
> Tous les fichiers `.ttf` sont dans le dossier **`/fonts-export`** à la racine du repo — 14 fichiers au total.

---

## 🎨 Les 3 familles utilisées dans Proof

| Famille | Rôle | Personnalité |
|---|---|---|
| **Inter** | UI, body, boutons, chiffres, stats, données | Sans-serif moderne, ultra-lisible |
| **Fraunces** | Titres éditoriaux (hero, noms de lieux, pull-quotes) | Serif à courbes rondes, chaleureux |
| **Playfair Display** | **Uniquement** le wordmark "proof." (logo header feed) | Serif classique élégant |

**Règle d'or** : jamais Fraunces sur un CTA · jamais Inter sur un titre éditorial · Playfair jamais en dehors du wordmark.

---

## 📥 Les 14 fichiers `.ttf` à uploader

Tous déjà présents dans **`/fonts-export`** du repo. Juste à upload.

### Inter (6 fichiers)

| Fichier | Poids | Usage |
|---|---|---|
| `Inter_400Regular.ttf` | 400 | Body, paragraphes, textes courants |
| `Inter_400Regular_Italic.ttf` | 400 italic | Hints, captions italiques |
| `Inter_500Medium.ttf` | 500 | Meta text, overlines, labels secondaires |
| `Inter_600SemiBold.ttf` | 600 | CTAs, boutons, labels importants, stats |
| `Inter_600SemiBold_Italic.ttf` | 600 italic | Emphase dans du body |
| `Inter_700Bold.ttf` | 700 | Chiffres profil, logos UI, stats de grande taille |

### Fraunces (6 fichiers)

| Fichier | Poids | Usage |
|---|---|---|
| `Fraunces_400Regular.ttf` | 400 | Textes éditoriaux longs (rare) |
| `Fraunces_400Regular_Italic.ttf` | 400 italic | **Pull-quotes**, citations créateur |
| `Fraunces_500Medium.ttf` | 500 | Sous-titres éditoriaux |
| `Fraunces_600SemiBold.ttf` | 600 | **Hero titles** plans, noms de lieux, titres d'étapes wizard |
| `Fraunces_600SemiBold_Italic.ttf` | 600 italic | Titres italiques emphatiques |
| `Fraunces_700Bold.ttf` | 700 | Titres de section très forts (rare) |

### Playfair Display (2 fichiers)

| Fichier | Poids | Usage |
|---|---|---|
| `PlayfairDisplay_700Bold.ttf` | 700 | **Wordmark "proof."** dans le header du feed |
| `PlayfairDisplay_900Black.ttf` | 900 | Hero logo (si grand format nécessaire) |

---

## 🌐 Sources officielles (Google Fonts)

Si jamais les fichiers du dossier sont corrompus ou pour récupérer les versions les plus récentes :

- **Inter** → https://fonts.google.com/specimen/Inter
- **Fraunces** → https://fonts.google.com/specimen/Fraunces
- **Playfair Display** → https://fonts.google.com/specimen/Playfair+Display

Licence : **Open Font License (OFL)** pour les trois → utilisation commerciale autorisée, modification autorisée, pas d'attribution obligatoire.

---

## 🔤 Mapping token → fichier (référence dev)

Pour info, dans le code (`src/constants/typography.ts`), les tokens exposés sont :

```ts
export const Fonts = {
  // ── Display (éditorial Fraunces) ──
  display:               'Fraunces_400Regular',          // → Fraunces_400Regular.ttf
  displayMedium:         'Fraunces_500Medium',           // → Fraunces_500Medium.ttf
  displaySemiBold:       'Fraunces_600SemiBold',         // → Fraunces_600SemiBold.ttf
  displayBold:           'Fraunces_700Bold',             // → Fraunces_700Bold.ttf
  displayItalic:         'Fraunces_400Regular_Italic',   // → Fraunces_400Regular_Italic.ttf
  displaySemiBoldItalic: 'Fraunces_600SemiBold_Italic',  // → Fraunces_600SemiBold_Italic.ttf

  // ── Body (UI Inter) ──
  body:                  'Inter_400Regular',             // → Inter_400Regular.ttf
  bodyMedium:            'Inter_500Medium',              // → Inter_500Medium.ttf
  bodySemiBold:          'Inter_600SemiBold',            // → Inter_600SemiBold.ttf
  bodyBold:              'Inter_700Bold',                // → Inter_700Bold.ttf

  // ── Logo (Playfair — wordmark uniquement) ──
  logo:                  'PlayfairDisplay_700Bold',      // → PlayfairDisplay_700Bold.ttf
  logoBlack:             'PlayfairDisplay_900Black',     // → PlayfairDisplay_900Black.ttf
};
```

---

## 🎯 Quelles tailles dans l'app

Référence design pour rester cohérent :

| Context | Font | Size | Weight | Letter-spacing |
|---|---|---|---|---|
| **Logo "proof."** | PlayfairDisplay | 30 | 700 | -1.2 |
| **Hero title plan** | Fraunces | 38 | 600 | -0.3 |
| **Titre étape wizard** | Fraunces | 17 | 600 | -0.2 |
| **Nom de lieu (timeline)** | Fraunces | 15-18 | 600 | -0.1 |
| **Pull-quote (conseil créateur)** | Fraunces italic | 21 | 400 italic | 0 |
| **Body paragraphe** | Inter | 13-15 | 400 | 0 |
| **CTA bouton** | Inter | 15-16 | 600 | 0 |
| **Stats profil (chiffres)** | Inter | 18-20 | 700 | 0 |
| **Overline / label** | Inter | 10-11 | 600 | 1.1-1.3 |
| **Meta / timestamp** | Inter | 11-12 | 400-500 | 0 |

---

## 🖼️ Exemples de rendu

Si tu veux voir les fonts en action dans le produit :

- **Hero plan** : ouvre un plan et regarde le titre blanc sur photo = Fraunces 600 38px
- **Logo feed** : le "proof." avec le point terracotta en haut à gauche = Playfair 700 30px
- **Chiffres profil** : "4 Plans · 6 Abonnés · 6 Suivis" = Inter 700 18px
- **Tip créateur** : les citations en italique dans le détail plan = Fraunces italic 21px
- **CTA "Suivant — ..."** : tous les boutons terracotta = Inter 600 15px

---

**Fichiers à uploader dans Claude Design** → tous les `.ttf` du dossier `/fonts-export` (14 au total).
