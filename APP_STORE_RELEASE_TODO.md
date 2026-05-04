# App Store Release — Pending Work

**Statut :** la version web (Vercel) est l'environnement de dev/test
actif. Le code est cross-platform safe : tout fonctionne sur iOS via
les fallbacks natifs (`expo-image-picker` etc.). Mais plusieurs
features web brandées **n'ont pas leur équivalent natif**, et plusieurs
réglages de release n'ont pas encore été faits.

Ce fichier liste **tout ce qui reste à faire avant de soumettre sur
l'App Store**. À mettre à jour au fil des avancées.

---

## 🎥 ProofCamera Phase 2 — camera native brandée

**Contexte :** Phase 1 (web) shipped — `<ProofCamera />` fullscreen,
filtres canvas (Warm/Golden/Chill/Fade), filter strip Insta-style,
9 surfaces migrées. Sur iOS aujourd'hui, le fallback `ProofCamera.tsx`
ouvre le picker iOS système (Photothèque / Caméra / Fichiers) — ça
fonctionne mais ce n'est PAS l'UI Proof brandée.

**Ce qui manque sur iOS pour avoir la parité avec le web :**

- [ ] Installer `react-native-vision-camera` (camera native customisable)
- [ ] Installer `@shopify/react-native-skia` (filtres GPU sans lag)
- [ ] Installer `expo-media-library` (photothèque custom, accès direct
      sans menu OS — ce qu'on a appelé "Pellicule" qui sera vraiment
      la photothèque sur native)
- [ ] Configurer `app.json` / `Info.plist` :
  - `NSCameraUsageDescription` — "Proof a besoin de la caméra pour
    capturer tes souvenirs et photos de plans"
  - `NSPhotoLibraryUsageDescription` — "Proof a besoin d'accéder à
    tes photos pour que tu puisses les ajouter à tes plans et albums"
  - `NSPhotoLibraryAddUsageDescription` — pour sauver des photos
- [ ] Créer le **dev build via EAS Build** (`eas build --profile
      development --platform ios`). Expo Go ne supporte PAS ces modules
      natifs.
- [ ] Implémenter `ProofCamera.tsx` (sans `.web` ext) avec :
  - [ ] Viewfinder via vision-camera (frame processors)
  - [ ] Bouton capture, flip, flash réels
  - [ ] Pinch-to-zoom + tap-to-focus
  - [ ] Galerie custom via `expo-media-library` (grid 3 colonnes,
        renommer "Importer" → "Pellicule" sur native)
  - [ ] Stage review : photo + filter strip + Reprendre/Valider
- [ ] Implémenter `applyFilter.ts` (sans `.web` ext) — filtres
      Skia ColorMatrix équivalents aux CSS filters de
      `applyFilter.web.ts`. La conversion la plus délicate :
      - `sepia()` → matrix
      - `saturate()` → matrix
      - `brightness()` → matrix
      - `hue-rotate()` → matrix (HSL conversion)
      - `contrast()` → matrix
      - L'overlay color → drawColor avec blendMode
- [ ] Implémenter `FilterStrip.tsx` (sans `.web` ext) — équivalent
      Skia du strip de mini-previews
- [ ] Tester chaque surface migrée :
      chat photo, plan cover, plan place photo (4:3), profil avatar
      (1:1), co-plan cover, co-plan place photo, DoItNow souvenir
- [ ] Tester gestion permissions refusées (caméra + photothèque)

**Fichiers concernés (déjà en place) :**
- `src/components/ProofCamera/ProofCamera.tsx` — fallback actuel à
  remplacer par l'implém native vision-camera
- `src/components/ProofCamera/index.ts` — API publique inchangée
- `src/components/ProofCamera/useProofCamera.tsx` — hook inchangé
- `src/components/ProofCamera/filters.ts` — définitions partagées
  (Web utilise CSS, Native utilisera Skia matrices basées sur les mêmes
  ids/labels)

**Estimation :** 1-2 jours de code + 1 jour setup EAS + tests

---

## 🚪 WaitingRoom — retirer l'override dev

- [ ] Dans `src/screens/WaitingRoomScreen.tsx`, retirer le bouton
      **"Commencer maintenant (dev)"**. Cf. commentaire dans le
      code : "Dev override — visible le temps qu'on développe. À
      retirer (ou cacher derrière un flag) quand le timing sera
      respecté en prod."
- [ ] Option : remplacer par un flag environnement (`__DEV__` only)
      pour le garder en dev mais le cacher en prod.

---

## 📸 Photos — items secondaires

- [ ] Migration de `pickMultipleImages` (album multi-photos plan)
      vers ProofCamera : ajouter un mode "burst" qui empile plusieurs
      shots dans une seule session. Aujourd'hui sur le système.
- [ ] Réconciliation `PhotoEditorSheet.tsx` (post-édition d'existant)
      avec ProofCamera : merger les filtres dans `filters.ts`, ne
      garder qu'un seul système.

---

## 📍 Permissions natives à configurer

Dans `app.json` (ou `Info.plist` direct selon la config Expo) :

- [ ] `NSLocationWhenInUseUsageDescription` — pour le live presence
      pendant les sessions DoItNow (`useLivePresence` hook)
- [ ] `NSCameraUsageDescription` — ProofCamera (cf. Phase 2)
- [ ] `NSPhotoLibraryUsageDescription` — ProofCamera (cf. Phase 2)
- [ ] `NSPhotoLibraryAddUsageDescription` — sauvegarder des photos
- [ ] `NSContactsUsageDescription` — si on veut "inviter via contacts"
- [ ] `NSUserNotificationsUsageDescription` — push notifications

---

## 🔔 Push notifications

État actuel : pas de push setup. Pour App Store, il faudra :
- [ ] Configurer Apple Push Notifications service (APNs)
- [ ] Setup Firebase Cloud Messaging (FCM) avec Apple
- [ ] Implémenter les triggers serveur :
  - [ ] Nouveau message dans une conv groupe
  - [ ] Quelqu'un a confirmé un plan partagé
  - [ ] Session démarrée (rejoins-nous)
  - [ ] X est passé à l'étape suivante (groupe DoItNow)
  - [ ] Quelqu'un t'a tagué dans un commentaire
- [ ] UI de gestion des préférences notifs dans Settings

---

## 🏗 EAS Build setup

- [ ] Vérifier `eas.json` à la racine (probablement absent)
- [ ] Configurer `eas build` avec profil `development`, `preview`, `production`
- [ ] Lier compte Apple Developer
- [ ] Créer App Store Connect record
- [ ] Setup Apple certificates + provisioning profiles via EAS
- [ ] Premier dev build : `eas build --profile development --platform ios`
- [ ] Premier preview build : `eas build --profile preview --platform ios`

---

## 🍎 App Store Connect — assets & metadata

- [ ] App icon (1024×1024 PNG)
- [ ] Launch screen (Expo en gère un par défaut, à custom)
- [ ] Screenshots iPhone (6.7", 6.5", 5.5") — 3-10 par taille
- [ ] App preview video (optionnel mais boost conversion)
- [ ] Description app store (FR + EN si international)
- [ ] Mots-clés (100 chars)
- [ ] Catégorie principale (probablement "Lifestyle" ou "Travel")
- [ ] Privacy Policy URL — obligatoire
- [ ] Support URL — obligatoire
- [ ] Marketing URL (optionnel)
- [ ] Age rating questionnaire
- [ ] Privacy nutrition labels (Apple — quelles données on collecte)

---

## 🧪 Tests à faire avant submission

- [ ] Login + signup sur device réel
- [ ] Création de plan complet (cover, lieux, étapes, publish)
- [ ] CoPlan workspace + lock + DoItNow groupe complet
- [ ] WaitingRoom countdown + auto-redirect
- [ ] Capture photo via ProofCamera (chat, plan, profil)
- [ ] Live presence pendant DoItNow groupe
- [ ] Notifications push (si setup)
- [ ] Mode hors-ligne (au moins gracieux dégradement)
- [ ] Permissions refusées (caméra, photothèque, géoloc, notifs) —
      l'app doit fonctionner ou afficher un fallback clair
- [ ] Test sur iPhone "vieux" (iPhone X / iOS 16) ET récent
      (iPhone 15 / iOS 18) pour couvrir le spectre

---

## 🔐 Backend / Firebase

- [x] Firestore Rules — config faite (mai 2026)
- [x] Storage Rules — config faite (mai 2026, pour ProofCamera)
- [ ] Composite indexes Firestore — vérifier qu'aucune requête en
      production déclenche un index manquant. Le bug "spots feed"
      avait nécessité un fix index ; auditer toutes les `where +
      orderBy` queries.
- [ ] Quotas Firebase — vérifier les limites du plan gratuit pour
      le launch (lectures Firestore, bandwidth Storage, exécutions
      fonctions)

---

## 📜 Historique des décisions importantes

Pour le contexte, les choix structurants pris pendant le dev web :

- **CoPlan post-execution publication** : un plan co-créé est créé
  privé au lock, devient public uniquement après que le groupe l'ait
  vécu (`CoPlanPublishScreen`). Pas de "publier sur le feed" au lock.
- **WaitingRoom unbypassable** : le seul override de timing est le
  bouton dev. À retirer en prod.
- **Per-user soft delete** des conversations (`deletedBy[]` sur la
  conv). Pas de delete destructive.
- **Per-user session completion** (`participants[uid].finishedAt`) :
  un user qui a terminé ne peut plus rejoindre. Quand tous ont fini,
  la session se ferme globalement.
- **ProofCamera filtres** : 5 filtres CSS (Original / Warm / Golden /
  Chill / Fade). Source unique dans `src/components/ProofCamera/filters.ts`.
- **Compression photos** : 1920px max sur le longer edge, JPEG 0.88
  côté capture, 0.9 côté validate. Final ≈ 300-600 KB.

---

_Dernière mise à jour : 4 mai 2026 (fin Phase 1B ProofCamera)._
