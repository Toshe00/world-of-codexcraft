# Audit de transformation CodexCraft

- Date de l'audit: 15 juillet 2026
- Depot: `levy-street/world-of-claudecraft`, fork local World of CodexCraft
- Branche auditee: `codexcraft-rework`
- Commit audite: `7c10f280eec380e9877e66ce16333089e171fe42`
- Point de comparaison: tag annote `base-originale`, qui dereference vers le meme commit
- Nature du document: audit technique et planification uniquement

Ce document ne constitue pas un avis juridique. Les conclusions de licence indiquent le niveau de preuve trouve dans le depot et les incertitudes a lever avant reutilisation ou distribution.

## 1. Resume executif

Le depot constitue une base techniquement viable pour creer un nouveau MMORPG sans reecrire le moteur. La simulation deterministe, le serveur autoritaire, l'interface `IWorld`, le rendu Three.js, les systemes de contenu et la persistance forment des separations suffisamment nettes pour remplacer progressivement l'identite, les assets et le monde.

La transformation ne doit cependant pas etre traitee comme un remplacement global de textes ou de fichiers. Le monde original est encode a la fois dans les definitions de zones, la generation de terrain, les collisions, les positions, les quetes, les marqueurs, les donjons, les sauvegardes et plusieurs consommateurs de rendu. De meme, `Eastbrook`, `Claudemoon`, `WOC` et `ClaudeCraft` sont parfois des libelles visibles, parfois des identifiants persistants, des noms d'infrastructure ou des contrats reseau.

Les conclusions principales sont les suivantes:

- Le moteur, le gameplay, la simulation 20 Hz, le multijoueur et l'architecture serveur peuvent etre conserves.
- Le meilleur premier seam est `WorldContent`, complete par l'editeur de carte pour un laboratoire hors ligne. Il ne couvre pas encore seul tous les consommateurs statiques ni le serveur autoritaire.
- Les identifiants d'objets, quetes, talents, recettes, zones, POI, donjons, delves, familiers, titres et monnaies doivent rester stables ou passer par une migration versionnee.
- Les positions du monde sont sauvegardees directement. Une nouvelle carte doit fournir une migration de coordonnees vers des positions sures avant sa mise en production.
- Le remplacement d'un modele GLB est possible sans toucher au gameplay si le contrat de clips, de squelette, de hauteur, d'orientation et d'attaches est respecte.
- Le runtime ne configure que Meshopt. Plusieurs `CLAUDE.md` locaux prescrivent encore Draco, ce qui est une derive documentaire dangereuse a corriger avant de produire de nouveaux assets.
- Les packs CC0 clairement documentes offrent la meilleure base de reutilisation. Les assets CraftPix achetes, les assets propres au projet et plusieurs generations Meshy, Tripo, Mixamo, Higgsfield ou ElevenLabs doivent etre remplaces ou faire l'objet d'une preuve de droits transmissibles.
- Un remplacement destructif de contenu ou de carte est bloque tant qu'il n'existe pas de registre des identifiants stables, de migrateur de sauvegarde, de sauvegarde PostgreSQL et de preuve de charge sur une base jetable representative.
- Le rebranding visuel peut commencer plus tot, a condition de conserver les identifiants techniques et d'introduire des alias pour les domaines, protocoles, cles locales et applications.

Etat technique au moment de l'audit:

| Verification | Resultat |
|---|---|
| `git status --short` initial | Propre |
| Branche | `codexcraft-rework` |
| HEAD et `base-originale` | Meme commit dereference |
| `npm run check:types` | Reussi, 0 erreur et 0 avertissement Svelte |
| `npm run build` | Reussi, avertissements de taille de chunks et imports dynamiques admin non bloquants |
| Fichiers existants modifies par les verifications | Aucun |
| Suite `npm test` complete | Non lancee, conformement au perimetre demande |

### Regles d'architecture a conserver

1. La simulation reste deterministe, sans DOM, Three.js, temps mural ni hasard non seme.
2. Le serveur reste l'autorite de combat, butin, quetes, economie et position.
3. Le rendu et l'interface ne contournent pas `IWorld` pour appeler directement `Sim`.
4. Le client envoie des intentions, jamais des resultats de gameplay.
5. Les identifiants persistants et les codes d'erreur sont append-only, sauf migration explicite.
6. Les manifestes generes ne sont jamais modifies a la main.
7. Le rendu, les collisions et la simulation doivent lire le meme contenu de monde.
8. Les changements de simulation client et serveur sont livres ensemble.

## 2. Architecture generale

### 2.1 Flux principal

```text
Entrées joueur
  -> commandes IWorld
  -> Sim locale hors ligne OU ClientWorld en ligne
  -> WebSocket et validation serveur
  -> GameServer possede Sim autoritaire a 20 Hz
  -> snapshots et evenements d'interet
  -> ClientWorld reconstruit l'etat
  -> Renderer Three.js et UI DOM/canvas lisent IWorld

Contenu statique
  -> src/sim/content/* et src/sim/data.ts
  -> WorldContent actif
  -> terrain, collisions, quetes, IA et instances
  -> rendu du terrain, de l'eau, des props et des personnages

Persistance
  -> Sim.serializeCharacter()
  -> server/db.ts
  -> PostgreSQL characters.state JSONB et world_state
```

### 2.2 Coeur de simulation

- `src/sim/sim.ts`: classe `Sim`, proprietaire de l'etat, serialisation des personnages et coordination des systemes.
- `src/sim/sim_context.ts`: `SimContext`, vues vivantes et callbacks transmis aux modules extraits.
- `src/sim/types.ts`: types de simulation, commandes, evenements et constantes partagees.
- `src/sim/entity.ts`: creation et statistiques des entites.
- `src/sim/combat/`: resolution des combats et effets.
- `src/sim/mob/`: IA, ciblage, deplacement et capacites des monstres.
- `src/sim/quests/`: acceptation, progression, credit et recompenses.
- `src/sim/instances/`: donjons et espaces instancies.
- `src/sim/items.ts`, `src/sim/bags.ts`, `src/sim/bank.ts`, `src/sim/loot/`: objets, inventaire, banque et butin.
- `src/sim/pathfind.ts`, `src/sim/colliders.ts`, `src/sim/spatial.ts`: mouvement, ligne de vue et spatialisation.
- `src/sim/voxel.ts`, `src/sim/voxel_mesh.ts`: representation voxel moteur et tests, distincte du rendu terrain vivant.

Le pas logique est de 50 ms, soit 20 Hz. La seed de production `20061` est fixee dans le demarrage hors ligne et dans `server/game.ts`. L'ordre des appels et des collections qui consomment le generateur aleatoire fait partie du comportement observable.

### 2.3 Systeme IWorld

- `src/world_api.ts`: interface agregee `IWorld`.
- `src/world_api/`: facettes de lecture, commandes, inventaire, quetes, social et autres domaines.
- Hors ligne: `Sim` satisfait structurellement `IWorld`.
- En ligne: `src/net/online.ts` fournit `ClientWorld`, applique les snapshots et emet les commandes.
- `src/game/`, `src/render/` et `src/ui/` consomment cette interface.

Tests de contrat prioritaires: `tests/world_api_parity.test.ts`, `tests/command_schema.test.ts`, `tests/command_facets.test.ts` et `tests/snapshots.test.ts`.

### 2.4 Rendu Three.js

- `src/render/renderer.ts`: orchestration de la scene, de la camera et des lumieres.
- `src/render/sky.ts`, `src/render/post.ts`, `src/render/gfx.ts`, `src/render/camera_collision.ts`: ciel, post-traitement, niveau graphique et collision camera.
- `src/render/terrain.ts`: chunks de terrain de 60 unites.
- `src/render/water.ts`: surfaces d'eau.
- `src/render/props.ts` et `src/render/foliage.ts`: batiments, decors et vegetation.
- `src/render/characters/`: chargement, normalisation, animation, LOD et equipement des personnages.
- `src/render/dungeon.ts`: geometrie visible des donjons.
- `src/render/assets/`: chargement, prechargement et manifeste media.
- `src/render/vfx.ts` et fichiers `*_vfx.ts`: effets visuels.

Le rendu est une projection de l'etat. Il ne doit jamais devenir proprietaire d'une decision de gameplay ou de collision.

### 2.5 Interface et audio

- `src/ui/`: UI DOM et canvas sans framework principal, fenetres, HUD, cartes, minimap, quetes, inventaire, talents et boutique.
- `src/main.ts` et `src/game/`: coordination de la session, des inputs, de l'audio et du renderer.
- `src/game/music.ts`: musique procedurale et orchestration musicale.
- `src/game/sfx.ts`, `src/game/sfx_manifest.generated.ts`: effets sonores et manifeste genere.
- `src/ui/combat_sfx.ts`, `src/game/voice.ts`, `src/render/world_audio.ts`: declencheurs de sons et voix.
- `public/audio/`: musiques, SFX, voix et packs runtime.

L'admin utilise Svelte, mais le client de jeu principal reste DOM/canvas natif.

### 2.6 Internationalisation

- `src/ui/i18n.catalog/`: catalogue source anglais et union de cles generee.
- `src/ui/i18n.locales/`: surcharges de locales.
- `src/ui/i18n.resolved.generated/`: tables resolues generees.
- `src/ui/sim_i18n.ts`, `world_entity_i18n.ts`, `talent_i18n.ts`, `deed_i18n.ts`: contenu de simulation et entites.
- `src/admin/i18n.*`: equivalent admin.
- `scripts/i18n_*.mjs`: generation, scan, verification et rapports.

Le build a genere toutes les locales configurees, la pseudo-locale et les tables denses. Un renommage visible doit modifier la source anglaise et suivre le workflow de generation, jamais editer directement les fichiers `*.generated`.

### 2.7 Outils et surfaces secondaires

- `src/editor/`: editeur de carte, conversion `MapDoc` vers `WorldContent` et playtest hors ligne.
- `headless/` et `python/`: environnement NDJSON et client Python.
- `bot/`: bot Discord.
- `electron/`: shell desktop, mise a jour, protocoles profonds et gardes de securite.
- `android/`, `ios/`, `capacitor.config.ts`: applications mobiles Capacitor.
- `scripts/`: generation, build, QA, screenshots, migrations, outils d'assets et de deploiement.
- `mediawiki/`: contenu wiki et integration.
- `server/http/`: routeur et middleware HTTP modernes.

## 3. Cartographie des dossiers

| Surface | Dossiers et fichiers responsables | Role dans la transformation |
|---|---|---|
| Simulation | `src/sim/`, `src/sim/sim.ts`, `sim_context.ts`, `types.ts` | Coeur a preserver, tests de parite obligatoires |
| Contenu monde | `src/sim/content/zone1.ts`, `zone2.ts`, `zone3.ts`, `dungeons.ts`, `temple.ts` | Definitions a remplacer progressivement |
| Agregation contenu | `src/sim/data.ts`, `WorldContent` dans `src/sim/types.ts` | Registres globaux et contenu actif |
| Terrain | `src/sim/world.ts`, `WorldContent` dans `src/sim/types.ts`, `src/render/terrain.ts` | Hauteurs partagees et rendu |
| Collisions | `src/sim/colliders.ts`, `src/sim/dungeon_layout.ts`, blockers du contenu | Autorite de mouvement et ligne de vue |
| Routes et POI | `src/sim/content/zone*.ts`, `src/sim/quest_targets.ts`, `src/sim/content/deeds.ts` | Coordonnees, marqueurs et progression |
| Villes | `ZoneDef.hub`, `ZonePropsDef`, PNJ et objets de `zone*.ts` | Un hub est un ensemble de donnees, pas un prefab unique |
| Donjons | `src/sim/content/dungeons.ts`, `src/sim/content/temple.ts`, `src/sim/instances/dungeons.ts`, `src/sim/dungeon_layout.ts`, `src/render/dungeon.ts` | Portes overworld, instances, collision et rendu |
| PNJ et monstres | `src/sim/data.ts`, `content/zone*.ts`, `src/sim/mob/` | Identites, spawns, IA, quetes et visuels |
| Quetes | `content/zone*.ts`, `src/sim/quests/`, `quest_targets.ts` | Graphe d'IDs et dependances spatiales |
| Objets et inventaire | `src/sim/data.ts`, `content/zone*.ts`, `items.ts`, `bags.ts`, `bank.ts` | IDs persistants a geler |
| Classes et competences | `src/sim/content/classes.ts`, `src/sim/combat/` | `CLASSES`, `ABILITIES` et mecanismes a preserver |
| Talents | `src/sim/content/talents.ts`, modules de talents | Arbres et allocations persistantes |
| Professions | `src/sim/content/professions.ts`, `src/sim/professions/` | Recolte, recettes et stations |
| Modeles 3D | `public/models/`, `src/render/characters/manifest.ts` | Assets remplacables sous contrat |
| Chargement media | `src/render/assets/loader.ts`, `media.ts`, `preload.ts` | GLTFLoader, Meshopt, cache et boot gate |
| Armes et attaches | `manifest.ts`, `weapon_grip.ts`, `back_grips.ts`, `src/ui/weapon_variants.ts` | Grip, os, stow et variante par item |
| Textures | `public/textures/`, textures embarquees GLB, `public/ui/` | Provenance et variantes a auditer |
| UI | `src/ui/`, `src/styles/`, HTML racine | Rebranding visible et contenu joueur |
| Audio | `public/audio/`, `src/game/music.ts`, `sfx.ts`, modules UI audio | Remplacement par provenance |
| Reseau client | `src/net/online.ts`, `api.ts`, contrats de commandes | Snapshots delta, reconnexion et API |
| Serveur | `server/main.ts`, `server/game.ts`, `server/http/` | Autorite, HTTP, WebSocket et operations |
| Persistance | `server/db.ts`, fichiers `*_db.ts`, `market_backfill.ts` | PostgreSQL, JSONB, leases et migrations |
| Desktop | `electron/`, scripts `electron-*.mjs`, `package.json` | Identite d'application, protocole et updater |
| Mobile | `capacitor.config.ts`, `android/`, `ios/` | Bundle IDs, stores, attestation et deep links |
| Build | `package.json`, `vite.config.ts`, `scripts/build_*.mjs` | Generation i18n, wiki, SFX, media et bundles |
| Tests | `tests/`, `vite.config.ts`, `vitest.browser.config.ts` | Simulation, serveur, UI, navigateur et plateformes |
| Deploiement | `docker-compose.yml`, `Dockerfile*`, `deploy/`, `.github/workflows/` | Linux, Docker, Caddy, DB et releases |

## 4. Architecture du monde et de la carte

### 4.1 Dimensions et repere

Le monde principal est un rectangle horizontal X/Z. Y est calcule depuis le terrain.

| Propriete | Valeur |
|---|---:|
| `WORLD_SIZE` | 360 |
| X minimum et maximum | -180 a 180 |
| Z minimum et maximum | -180 a 900 |
| Longueur totale Z | 1080 |
| Point de depart joueur | `(2, -2)` |
| Direction nord carte | +Z |
| Seed client hors ligne et serveur | `20061` |

Les zones sont concatenees par bandes de 360 unites:

| ID technique | Nom visible actuel | Bande Z | Niveaux | Hub | Cimetiere |
|---|---|---:|---:|---|---|
| `eastbrook_vale` | Eastbrook Vale | -180 a 180 | 1 a 7 | Eastbrook `(0, 0)`, rayon 26 | `(-12, -14)` |
| `mirefen_marsh` | Mirefen Marsh | 180 a 540 | 6 a 13 | Fenbridge `(0, 300)`, rayon 20 | `(-18, 286)` |
| `thornpeak_heights` | Thornpeak Heights | 540 a 900 | 13 a 20 | Highwatch `(0, 660)`, rayon 20 | `(15, 645)` |

Les fichiers canoniques sont `src/sim/content/zone1.ts`, `zone2.ts`, `zone3.ts` et leur agregation dans `src/sim/data.ts`.

### 4.2 Construction du terrain

`src/sim/world.ts` fournit les fonctions pures partagees par simulation et rendu:

- `terrainHeight(x, z, seed)`: hauteur de base.
- `groundHeight(x, z, seed)`: sol marchable avec corrections locales.
- `waterLevelAt(x, z)`: niveau d'eau pour le contenu actif.
- `roadDistance(x, z)`: distance aux polylignes de routes.
- `generateDecorations(seed)`: placements deterministes de decors.

La hauteur combine un bruit FBM, une forme par biome, les plateaux de hubs, les cuvettes de lacs, les aplatissements de camps, les crêtes de frontiere, les murs peripheriques, des terrasses et des retouches de terrain. Les valeurs structurantes observees sont:

- eau globale a `-4.5`, surchargeable par `WorldContent`;
- transition de lac jusqu'a `1.6` fois son rayon;
- crêtes de frontiere hautes de 40 avec passage fixe autour de `x = 0`;
- cratere Mirefen code autour de `(149.5, 295)`;
- terrain Vale Cup code autour de `(-11, -112)`;
- `x > 600` reserve aux espaces d'instance dans plusieurs calculs.

Les routes sont des polylignes dans les fichiers de zone. Elles guident le rendu, la carte et l'exclusion des decorations, mais ne sculptent pas directement la hauteur ni la collision. Une route traversant une frontiere doit aujourd'hui rejoindre le passage de crête fixe.

### 4.3 Biomes et eau

Les trois biomes de production sont `vale`, `marsh` et `peaks`. Des biomes de peinture existent aussi, notamment plage, desert, volcan et cave. Le mapping numerique des biomes est persiste et doit rester append-only.

Les lacs sont des empreintes declarees dans les `ZoneDef`. Une surface basse hors empreinte de lac n'est pas automatiquement de l'eau. Remplacer le terrain sans mettre a jour les empreintes peut creer un sol submerge visible mais non considere comme eau, ou l'inverse.

### 4.4 Placement du monde

`BUILTIN_WORLD` rassemble:

- zones et hubs;
- routes;
- camps de monstres;
- PNJ;
- objets au sol;
- noeuds de recolte;
- props de villes et de regions;
- blockers;
- modifications de terrain;
- point de depart joueur.

Les props couvrent batiments, puits, stands, mines, quais, tentes, caisses, feux, huttes, ruines, clotures, cimetieres et marqueurs de delves. `src/render/props.ts` et `src/sim/colliders.ts` doivent consommer les memes placements.

Les decorations naturelles sont generees sur une grille hachee deterministe. Elles excluent notamment hubs, camps, routes, eau et fortes pentes. Modifier la seed, l'ordre d'une collection ou un filtre peut changer un grand nombre de positions.

L'ordre de `CAMPS` est charge de sens RNG. Les commentaires et tests imposent des ajouts append-only. Inserer un camp au milieu de la liste peut deplacer les spawns des camps suivants.

### 4.5 Collisions et deplacement

`src/sim/colliders.ts` construit et met en cache les colliders des props, arbres, rochers, placements editeur et blockers. Il fournit notamment `resolvePosition`, `resolveMovement`, `lineOfSightClear` et `invalidateStaticColliders`.

Un remplacement visuel de batiment doit donc mettre a jour en meme temps sa geometrie de collision. Une divergence peut produire des murs invisibles, traversables ou des lignes de vue incoherentes entre combat et rendu.

### 4.6 Quetes et coordonnees

Les `QuestDef` lient des identifiants de donneur et de retour, des objectifs mob, item, objet ou PNJ, des prerequis et des recompenses. `src/sim/quest_targets.ts` derive les zones de marqueurs depuis les collections globales `CAMPS`, `GROUND_OBJECTS` et `NPCS`.

Les dependances spatiales incluent aussi:

- cimetieres dans `src/sim/content/graveyards.ts`;
- boites aux lettres dans `mailboxes.ts`;
- boss mondial dans `src/sim/world_boss.ts`;
- stations d'artisanat dans `src/sim/content/professions.ts`;
- Moongate autour de `(-70, 792)` dans `src/sim/content/temple.ts`;
- Vale Cup dans `src/sim/vale_cup_layout.ts`;
- portes de donjons et delves;
- POI et deeds de visite;
- sous-zones, presence serveur, carte et minimap.

`zoneAt(z)` et plusieurs consommateurs utilisent encore les `ZONES` statiques alors que le terrain peut lire un `WorldContent` actif. Cette asymetrie est le principal obstacle a un simple remplacement de `BUILTIN_WORLD`.

### 4.7 Donjons et espaces eloignes

- Seuil d'instance: `DUNGEON_X_THRESHOLD = 600`.
- Sol d'instance: Y = 0.
- Origine X: `900 + index * 600`.
- Origine Z: `-1250 + slot * 500`.
- Nombre de slots: 24.

Les `DungeonDef` contiennent porte overworld, index, offsets, spawns, objets et cle d'interieur. `src/sim/dungeon_layout.ts` est partage par collisions et rendu. Le runtime se trouve dans `src/sim/instances/dungeons.ts`, le rendu dans `src/render/dungeon.ts` et le contenu dans `src/sim/content/dungeons.ts` et `src/sim/content/temple.ts`.

D'autres espaces utilisent des bandes de coordonnees eloignees, dont l'arene, les delves, Yumi et Vale Cup. Ces conventions doivent etre inventoriees avant d'agrandir ou de rebaser le monde.

### 4.8 Editeur et zone laboratoire

`src/editor/custom_map.ts` et `src/editor/3d/viewport.ts` convertissent un `MapDoc` en `WorldContent`, puis composent le vrai `Sim` et le vrai renderer pour un playtest hors ligne. `src/sim/map_doc.ts` normalise et borne les documents.

Limites actuelles:

- le playtest n'est pas autoritaire ni multijoueur;
- le monde personnalise repart partiellement du monde integre;
- certains props restent ceux de `BUILTIN_WORLD`;
- les routes ne sont pas completement editables;
- plusieurs consommateurs lisent encore des constantes globales.

L'editeur est donc adapte a une zone laboratoire visuelle et fonctionnelle hors ligne, puis doit etre complete par une integration explicite cote serveur pour la validation autoritaire.

### 4.9 Ensemble de dependances a modifier pour remplacer une zone

Une zone ne doit etre consideree remplacable que si la meme livraison traite ou prouve l'absence d'impact sur:

1. `ZoneDef`, bornes, biome, hub, cimetieres, lacs, sous-zones et POI.
2. Terrain, eau, edits, routes, passages de frontiere et seed.
3. Props, placements, vegetation, decorations et colliders.
4. Camps, ordre des camps, templates de mobs et boss mondiaux.
5. PNJ, objets au sol, noeuds de recolte, boites aux lettres et stations.
6. Quetes, prerequis, objectifs, marqueurs, recompenses et lettres.
7. Donjons, delves, portes, sorties et positions de retour.
8. Carte, minimap, HUD, noms de zones, deed de visite et guide.
9. Positions sauvegardees, cadavres, retours au cimetiere et personnages linkdead.
10. Presence serveur, portee des snapshots et localisation administrative.
11. I18n, wiki et captures de documentation.
12. Tests de determinisme, terrain, collisions, quetes, donjons, snapshots et persistance.

## 5. Architecture des modeles 3D

### 5.1 Inventaire au commit audite

L'inventaire automatique confirme un parc GLB important, accompagne de sources ou images de support. Les chemins, manifestes et commandes d'inventaire restent les sources d'autorite, car tout compte litteral deriverait au prochain ajout.

| Sous-arbre | Contenu principal |
|---|---|
| `public/models/biome/` | Decors de biomes et villes |
| `public/models/chars/` | Joueurs, NPC, ennemis humanoides, skins et CombatMech |
| `public/models/creatures/` | Animaux et monstres |
| `public/models/dungeon/` | Modules de donjons et interieurs |
| `public/models/foliage/` | Arbres et vegetation |
| `public/models/props/` | Props statiques |
| `public/models/quest/` | Objets de quete |
| `public/models/resources/` | Packs modulaires et ressources |
| `public/models/tools/` | Outils et objets tenus |
| `public/models/weapons/` | Variantes d'armes |

Les inventaires chiffres de plusieurs `CLAUDE.md` locaux ont derive. Ils ne doivent pas etre utilises comme catalogues de licence.

### 5.2 Chargement GLTF

`src/render/assets/loader.ts` configure un singleton `GLTFLoader` avec `MeshoptDecoder`. Aucun `DRACOLoader` n'est configure.

- `assetUrl()` renvoie le chemin logique en developpement et le chemin hache en production.
- Les promesses de chargement sont mises en cache.
- Un echec est evince du cache pour autoriser une nouvelle tentative.
- Le resultat cache est considere immuable et doit etre clone avant mutation.
- Les files de chargement sont bornees pour GLTF, textures et HDR.

`src/render/assets/media.ts` resout le manifeste hache. `scripts/build_media_manifest.mjs` genere `src/render/assets/manifest.generated.ts` pour modeles, textures, environnements et VFX. `src/render/assets/preload.ts` fournit la barriere de boot et agrège les erreurs.

Analyse structurelle des GLB au moment de l'audit:

- la grande majorite utilise `EXT_meshopt_compression`;
- aucun n'utilise Draco;
- une minorite ne declare ni Meshopt ni Draco, surtout dans les armes et quelques modeles historiques;
- aucun GLB inspecte n'etait structurellement invalide.

La prescription Draco presente dans plusieurs guides locaux est donc incompatible avec le loader actuel. Le code de chargement et `scripts/assets/build_assets.mjs` sont les autorites jusqu'a correction coordonnee de la documentation.

### 5.3 Manifeste personnages

`src/render/characters/manifest.ts` definit `VISUALS` et le contrat `VisualDef`:

- URL du corps et donneurs d'animations;
- hauteur en unites monde, mesuree du pivot au sommet;
- table des clips;
- hauteur de hover et correction yaw;
- allowlist de parties visibles;
- attachments avec URL, os, position, rotation et reference de grip;
- slots d'armes;
- tint, vitesses de reference, timing, preload paresseux et corrections d'armes.

`visualKeyFor()` associe classes, familles, mobs et PNJ aux cles du manifeste. `manifestUrls()` rassemble corps, animations, attachments et variantes d'armes. L'ensemble de preload standard et bas niveau doit rester independant du tier detecte au chargement.

`src/render/characters/assets.ts` clone via `SkeletonUtils`, fusionne les parties skinned, filtre les accessoires, attache les objets, pose le modele, calcule les bounds, normalise la hauteur et le yaw, puis prepare clic et LOD. `src/render/characters/visual.ts` possede un `AnimationMixer` par entite et pilote la machine d'etats visuelle.

### 5.4 Animations et squelettes

Le vocabulaire KayKit attendu comprend notamment:

```text
Idle
Walking_A
Running_A
Walking_Backwards
1H et 2H Melee Attack
2H Ranged Shoot
Spellcasting
Spellcast Shoot
Hit_A
Death_A
Jump_Idle
Sit_Floor_*
Lie_Idle
emotes
```

Les squelettes, Quaternius et rigs specialises utilisent leurs propres tables de clips. Les familles dediees incluent loup, sanglier, bipedes, flottants, araignees, volaille, casters de raid et autres rigs specifiques.

Un clip absent beneficie souvent d'un fallback, mais le resultat peut etre visuellement faux ou desynchronise du rythme de combat. Un remplacement ne doit donc pas se contenter de charger sans erreur.

Les neuf classes utilisent sept corps KayKit distincts. Mage, priest et warlock partagent le corps mage. Les skins de classes sont des atlas compatibles UV. L'index 0 est la texture embarquee. Le catalogue de simulation et les comptes de skins doivent rester en lockstep.

### 5.5 Armes et points d'attache

Les os principaux sont `handslot.r` et `handslot.l`. Le chargeur assainit les noms et essaie les formes avec et sans ponctuation. Si l'os est absent, l'accessoire peut disparaitre silencieusement.

`src/render/characters/weapon_grip.ts` applique des conventions par famille, puis des surcharges par modele. Les familles couvrent epee, dague, staff, hache, marteau, mace, arme d'hast, wand, livre, arbalete et arc. L'origine du modele doit se trouver au grip, avec lame ou tete vers +Y. `back_grips.ts` gere le rangement sur le torse. `src/ui/weapon_variants.ts` lie les IDs d'items aux variantes GLB.

Chaque arme doit etre validee sur tous les corps concernes, en idle, marche, attaque, main droite, main gauche et stow.

### 5.6 Textures, orientation et optimisation

- Avant des personnages et props: +Z.
- Base des props: Y = 0.
- Echelle personnage: normalisee par `VisualDef.height`.
- Textures statiques: souvent reencodees WebP et embarquees dans les GLB.
- Skins: meme UV que le corps de reference.
- CombatMech: chromas et emissive specifiques.
- La collision ne se deduit pas automatiquement du mesh visible.

`scripts/assets/build_assets.mjs` applique resample, prune, dedup, compression de textures et Meshopt. Les caracteres et statiques ne sont pas simplifiees, jointes ou aplaties par defaut. `scripts/assets/build_foliage.mjs` peut souder et simplifier la vegetation. `scripts/combine_fbx_to_glb.mjs` fusionne des FBX et des takes, puis exporte en GLB.

`scripts/asset_pipeline/` fournit des voies weapon, prop, creature, skin, skinset, skinmodel et rig-manual. Il propose validation, preview, preview-held, inspection, controle de mouvement racine et bibliotheque 3D. La revue visuelle et `qa --job` sont obligatoires avant integration.

Budgets documentes par la pipeline:

| Famille | Budget indicatif |
|---|---|
| Arme | 1 500 triangles et 120 Ko |
| Prop | 6 000 triangles et 350 Ko |
| Creature | 8 000 triangles et 1 536 Ko |

### 5.7 Provenance des modeles

| Source | Elements identifies | Decision provisoire |
|---|---|---|
| KayKit CC0 verifie fichier par fichier | Adventures 1.0 et autres packs explicitement relies aux notices CC0, dont squelettes, animations ou modules selon leur source | Reutilisable uniquement quand le fichier final est relie au pack CC0 exact |
| KayKit Adventurers 2.0 payant | Corps joueurs actuels signales par `scripts/assets/specs/characters_v2.json` | Droit achete par le projet ou provenance contradictoire; remplacer sans preuve ecrite transferable |
| Quaternius | Creatures historiques, foliage, village, fish, pirate, donjons modulaires | Reutilisable si correspondance fichier-pack verifiee |
| Kenney | Nature, graveyard, pirate, fantasy town, castle, survival, watercraft, dungeon, VFX | Reutilisable si correspondance fichier-pack verifiee |
| Meshy | Tolling bell, spider egg sac, Yumi Cat et anciennes entrees | Remplacer sans preuve de plan, compte, prompt et transfert |
| Tripo | Armory Season 1, props nommes, certains animaux et remplacements proceduraux | Remplacer ou documenter chaque tache et titulaire de droits |
| Mixamo | `stone_cantor.glb` signale comme rigge Mixamo | Provenance et conditions de redistribution a verifier |
| Procedural | `chicken_cow.glb`, certains panoramas et remplacements derives | Verifier droits sur les entrees et l'auteur avant reutilisation |
| Projet | CombatMech, chromas, assets custom, anciens modeles Claudium | Ne pas supposer une autorisation du fork |
| Non determinee | `public/models/quest/*`, plusieurs customs et sorties historiques | Mettre en quarantaine ou remplacer |

### 5.8 Contrat de remplacement d'un modele

Un modele est acceptable uniquement si:

1. Sa provenance et sa licence sont reliees au fichier final par un registre.
2. Il est GLB compatible avec le loader Meshopt actuel.
3. Son orientation, pivot, base, hauteur et bounds sont verifies.
4. Son squelette et ses noms d'os satisfont le manifeste.
5. Les clips requis existent, sont in-place et leurs timings sont controles.
6. Les grips, attachments, armes et stow sont verifies sur les rigs concernes.
7. Les textures et variantes ne cassent pas les UV ni l'emissive.
8. Le LOD, la portee de clic, le shadowing et les tiers graphiques sont controles.
9. La collision de gameplay reste volontaire et coherente.
10. Les tests de manifeste, preload, rig, armes et build passent.
11. Le rendu est inspecte en jeu hors ligne puis en multijoueur.

## 6. Architecture du gameplay

### 6.1 Classes, competences et talents

- `src/sim/content/classes.ts`: `CLASSES` et `ABILITIES`.
- `src/ui/class_details_data.ts`: presentation des classes.
- `src/sim/content/talents.ts`: arbres `TALENTS` et version de build.
- Modules `src/sim/combat/` et fichiers de mecanismes: effets, couts, cooldowns et resolution.
- `src/ui/talents_view.ts`, spellbook et action bar: presentation et commandes.

Le changement d'apparence d'une classe doit rester distinct du `PlayerClass`, des IDs de competences et des allocations sauvegardees. Les neuf classes et leurs mecanismes peuvent etre conserves sous de nouveaux libelles et visuels.

### 6.2 Monstres et IA

- Templates dans `src/sim/content/zone*.ts`, `src/sim/content/dungeons.ts` et `src/sim/data.ts`.
- IA dans `src/sim/mob/`.
- Creation d'entites dans `src/sim/entity.ts`.
- Association visuelle dans `src/render/characters/manifest.ts`.
- Audio et presentation dans `src/ui/combat_sfx.ts` et modules de nameplates.

Le remplacement d'un ennemi peut conserver son ID, son template, son AI family et sa hitbox tout en changeant la cle visuelle. Si le nouveau silhouette exige une hitbox differente, ce n'est plus un simple remplacement artistique et les tests combat, portee, ligne de vue et navigation deviennent obligatoires.

### 6.3 PNJ et quetes

Les PNJ contiennent position, identite, services et quetes. Les quetes referencent donneur, retour, objectifs, prerequis, mobs, items, objets et recompenses. Les noms visibles peuvent changer sans renommer les IDs. Les histoires doivent etre migrees par chaine de quetes complete, jamais par remplacement global d'un terme.

### 6.4 Objets, inventaire et economie

`ITEMS` est agrégé dans `src/sim/data.ts` depuis les modules de contenu. Les IDs sont sauvegardes dans equipement, sacs, banque, courrier, marche et recompenses. `tests/shipped_item_ids.test.ts` protege l'inventaire des IDs livres.

Pour retirer un objet original:

1. cesser ses nouvelles acquisitions;
2. conserver sa definition de lecture;
3. migrer ou echanger les exemplaires existants;
4. verifier marche, courrier, banques et escrow;
5. supprimer la definition uniquement apres preuve d'absence et fenetre de compatibilite.

### 6.5 Animations et presentation du combat

La simulation publie etats et evenements, tandis que la machine d'animation choisit clips et one-shots. Les timings visuels ne doivent pas devenir la source de verite d'un impact. Un asset peut donc etre remplace sans changer le combat, a condition de conserver une lecture claire des attaques, impacts, morts et incantations.

## 7. Architecture serveur et persistance

### 7.1 Serveur autoritaire

`server/main.ts` initialise HTTP, les routes, WebSocket, caches, metriques et arret ordonne. `server/game.ts` contient `GameServer`, proprietaire d'une unique `Sim` par processus de royaume. La boucle autoritaire tourne a 20 Hz.

Portees observees:

- interet joueur autour de 90 yd;
- interet PNJ autour de 120 yd;
- replication pleine frequence jusqu'a 55 yd.

Les valeurs doivent etre revalidees si la densite ou la topologie du nouveau monde change fortement.

### 7.2 WebSocket et snapshots

`server/ws_auth.ts` impose un premier message `auth`, un delai de 10 secondes, l'upgrade sur `/ws`, les gardes d'admission et l'acquisition du lease avant `game.join`. Le serveur WebSocket utilise `noServer` et une taille maximale de message de 16 KiB.

`wireEntity`, les champs dynamiques et identitaires, `broadcastSnapshots` et `snap.keep` sont couples au decodeur `src/net/online.ts`. L'absence d'un champ dans un delta ne signifie pas sa suppression. Toute evolution de schema exige une preuve de compatibilite client-serveur.

Le mode linkdead conserve un personnage cinq minutes. Les messages `character already in world` et `authentication timed out` servent a la politique de reconnexion et ne doivent pas etre renommes comme de simples textes UI.

### 7.3 HTTP

`server/http/` contient le routeur moderne, le registre, le dispatcher, le contexte, les schemas, les erreurs et les middleware. Les codes d'erreur sont append-only.

`API_DISPATCH=legacy` est le retour arriere actuel vers l'ancien routeur. Tant que les deux chemins existent, une route migree est soumise a la regle de double edition et aux tests de parite. Le rebranding d'une reponse ou d'une route doit tenir compte des deux bras.

### 7.4 PostgreSQL

`server/db.ts` centralise le pool, le schema, les personnages, les leases, le marche, le courrier et de nombreuses requetes. Les modules `*_db.ts` portent les requetes de domaines specialises.

`characters.state` est un JSONB qui correspond a `CharacterState` dans `src/sim/sim.ts`. Il conserve notamment:

- position et orientation;
- equipement, sacs et banque;
- quetes et progression;
- talents, recettes et competences;
- lockouts, familier et cadavre;
- titres, deeds, zones et delves;
- etats d'economie et de contenu.

La restauration overworld reprend directement les coordonnees dans les cas ordinaires. Une nouvelle geometrie peut donc charger un personnage dans l'eau, un mur ou hors carte.

Les sauvegardes sont effectuees toutes les 30 secondes, avec une concurrence de quatre personnages, une queue serialisee par personnage et un write fence base sur holder et nonce du lease. La sauvegarde de depart est retentee au plus cinq fois. Le depart peut ecrire personnage et escrow marche/courrier dans une transaction.

Le marche et le courrier sont des blobs JSONB par royaume dans `world_state`, avec les cles `market:<realm>` et `mail:<realm>`. Le write gate et le backfill existants ne doivent pas etre contournes.

Leases:

- TTL 90 secondes;
- heartbeat 30 secondes;
- holder par processus et nonce;
- write fence dans le meme `UPDATE`.

Pool par processus:

- 10 connexions maximum;
- acquisition 5 secondes;
- statement timeout ordinaire 15 secondes;
- charge lourde 60 secondes;
- backstop driver 65 secondes.

Tous les processus de royaume partagent `DATABASE_URL`. Le budget minimal est donc `10 * nombre de processus`, hors outils et maintenance.

La limite de 5 000 joueurs est un garde-fou de configuration, pas une capacite prouvee. A cette echelle, une sauvegarde complete toutes les 30 secondes represente environ 167 ecritures personnage par seconde avant auth, HTTP, marche, courrier et analytics. Ce calcul est une projection statique, pas une mesure.

### 7.5 Risques et preuves PostgreSQL requises

Verdict de l'audit performance: blocage de tout remplacement destructif de carte ou d'IDs tant qu'une migration et une preuve de capacite n'existent pas. Ce verdict ne signale pas un defaut de la base actuelle.

Preuves a produire avant production:

- PostgreSQL jetable sur la version moteur et driver deployes;
- sauvegardes anonymisees representant anciens et nouveaux formats;
- migrateur idempotent, dry-run et rapport de cardinalites;
- charge mixte autosave, auth, API, marche et courrier;
- mesures agregees de pool, latence, timeout, pic de concurrence, age de sauvegarde et taille JSONB;
- test de binaires mixtes si un rolling deploy est envisage;
- test explicite nouveau vers ancien, ou decision forward-only documentee.

### 7.6 Electron

Contrats de marque sensibles:

- `package.json`: `appId=com.worldofclaudecraft.desktop`, `productName`, protocole `worldofclaudecraft` et feed `https://updates.worldofclaudecraft.com/desktop`;
- `electron/main.cjs`: origine `app://worldofclaudecraft`, deep links, navigation et IPC;
- `electron/desktop_config.cjs`: distributions website et Steam;
- `scripts/electron-build.mjs`, `scripts/electron-builder-config.mjs`: packaging.

Changer `appId` ou package peut creer un nouveau repertoire utilisateur et une nouvelle identite installee. Le protocole profond, l'origine `app://`, les callbacks et le feed d'update doivent garder des alias pendant une transition. L'updater refuse les downgrades, donc le rollback doit passer par une nouvelle version corrective.

### 7.7 Capacitor

`capacitor.config.ts` declare `appId=com.worldofclaudecraft`, le nom de l'application et `webDir=dist`. Android et iOS portent leurs propres bundle IDs, URL schemes, icones, entitlements et plugins.

Un nouvel identifiant d'application peut etre considere comme une nouvelle application par les stores. Il affecte signatures, Play Integrity, DeviceCheck, OAuth, deep links, allowlists serveur et continuite des donnees. La validation doit etre faite sur Android avec JDK 21 et sur macOS/Xcode avec un appareil iOS reel.

Le script `build:native` emploie une syntaxe POSIX et ne doit pas etre interprete comme portable vers PowerShell.

## 8. Matrice des licences et assets

### 8.1 Principes

- `LICENSE` place le code source sous MIT, avec conservation du copyright et de la notice.
- Une licence de code a la racine ne suffit pas a prouver les droits sur chaque asset tiers, achete, commissionne ou genere.
- `CREDITS.md`, `License.txt`, les manifestes, les fichiers de licence et la preuve de compte doivent etre relies au fichier final.
- Une absence de credit n'est pas une preuve d'interdiction, mais c'est un blocage de reutilisation tant que la provenance n'est pas etablie.

### 8.2 Matrice

| Categorie demandee | Assets concernes | Conditions et decision |
|---|---|---|
| Reutilisable sans difficulte apparente | Fichiers relies sans ambiguite aux packs CC0 KayKit, Quaternius, Kenney, loafbrr, ambientCG et Poly Haven | Archiver licence, version du pack et correspondance fichier. Ne pas inclure par defaut les corps joueurs du spec KayKit payant. |
| Reutilisable avec attribution | `public/env/space_galaxy.jpg`, ESO/S. Brunier, CC BY 4.0 | Conserver credit, auteur, licence et lien. |
| Reutilisable avec notice | Water normals de Three.js sous MIT, code MIT | Conserver notices applicables dans la distribution. |
| Reutilisable sous conditions | Fontes `public/fonts/*.woff2` sous SIL OFL 1.1 | Conserver licence, verifier noms reserves et conditions de redistribution. |
| Reutilisable sous conditions | Logos Twitch, X, Kick, YouTube et Discord dans `src/ui/ui_icons.ts` | Marques tierces, uniquement avec le service correspondant et selon leurs regles de marque. |
| Licence achetee Levy Street, a remplacer | Packs premium CraftPix, dont icones de competences et vaste majorite du mapping d'items; corps joueurs KayKit Adventurers 2.0 signales comme pack payant | Remplacer, ou obtenir une preuve ecrite d'attribution ou de licence au fork. |
| Asset propre au projet, reutilisation non clairement autorisee | Backdrops, CombatMech, chromas, anciennes armes Claudium, icones de sacs, UI SFX, deed icons commissionnees, art specifique | Demander cession ou nouvelle licence, sinon remplacer. |
| Generation IA sous conditions | Meshy, Tripo, Higgsfield, Recraft, OpenAI, ElevenLabs | Conserver titulaire du compte, plan, date, entrees, task ID et conditions au moment de la generation. Remplacer en l'absence de dossier probant. |
| Mixamo sous conditions | `stone_cantor.glb` signale comme Mixamo-rigged | Usage jeu generalement permis, mais provenance du fichier, redistribution brute et chaine de derivation restent a verifier. |
| Audio clairement CC0 | `quest_*.mp3` et `lockpick_*.mp3` documentes | Conserver le lien entre source, auteur et fichier. |
| Provenance a verifier | Musiques top-level, grande partie des SFX et voix, modeles quest, customs historiques | Mettre en quarantaine ou remplacer avant une distribution du nouveau jeu. |
| Marque ou logo a remplacer obligatoirement | World of ClaudeCraft, ClaudeCraft, WOC, Claudium visuel, logos, whitepaper, favicons, splash, loading et promotion | Remplacer visuels et textes. Conserver temporairement les IDs techniques uniquement pour compatibilite. |

### 8.3 Verifications externes officielles

Les pages suivantes ont ete consultees comme sources actuelles, sans remplacer l'analyse d'un juriste:

- CraftPix, licence officielle: <https://craftpix.net/file-licenses/>. Les droits achetes sont decrits comme limites, non exclusifs et non transferables, sans droit de redistribuer les sources.
- Meshy, propriete des modeles: <https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models>. Les droits varient selon le plan et les conditions des entrees.
- Tripo, conditions: <https://www.tripo3d.ai/pt/terms>. Les droits et responsabilites dependent notamment du plan et les sorties ne sont pas garanties uniques ou non contrefaisantes.
- Adobe Mixamo, FAQ officielle: <https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>. L'usage dans un jeu est annonce comme permis, mais le dossier de provenance du fichier reste necessaire.

### 8.4 Inventaire de vigilance

- CraftPix: les mappings observes relient les ensembles d'icones de competences et la vaste majorite des icones d'items au contenu premium, les autres etant notamment des sacs projet. Reproduire l'inventaire depuis les mappings au lieu de figer un compte.
- Deeds: les icones commissionnees sont signalees comme projet et doivent etre reliees a leur contrat.
- Audio: les scripts suggerent des generations ElevenLabs, mais `CREDITS.md` ne relie pas chaque voix et SFX au plan ou au titulaire.
- Wallet: `THIRD_PARTY_NOTICES.md` contient des notices Reown et WalletConnect alors que les dependances courantes visibles ne les exposent plus directement. Verifier le lockfile et les bundles avant de conserver ou retirer ces notices.

## 9. Inventaire des references de marque

### 9.1 Photographie de recherche

La recherche insensible a la casse sur les fichiers suivis couvre `World of ClaudeCraft`, `ClaudeCraft`, `WOC`, `Levy Street`, `Claudemoon` et `Eastbrook`. Elle inclut les miroirs i18n, docs et tests. L'inventaire doit etre reproduit avec `git grep` a chaque phase plutot que fige par des comptes qui derivent.

| Terme | Surfaces dominantes | Interpretation |
|---|---|---|
| World of ClaudeCraft | Public, SEO, docs, UI et tests | Marque visible et metadonnees |
| ClaudeCraft | Public, source, i18n, docs et tests | Marque et identifiants techniques |
| WOC comme mot | Source, tests, serveur, docs, env et outils | Marque, token, metriques et compatibilite |
| Levy Street | Credits, legal, emails et metadata | Auteur et relations contractuelles |
| Claudemoon | Source, serveur, tests et deploiement | Realm par defaut et contenu |
| Eastbrook | Contenu, serveur, tests, Docker et deploy | Ville, zone, DB et infrastructure |

L'etendue de ces surfaces interdit un remplacement global. Les fichiers generes et tests multiplient les miroirs d'une meme source.

### 9.2 Purement visuel ou editorial

- Logos: `public/woc-logo-guide.webp`, `woc-logo-hero.webp`, `woc_logo_square.webp`, `worldofclaudecraft-logo.png` et images de marque a la racine.
- Whitepaper: `public/World-of-ClaudeCraft-Whitepaper-v1.0.pdf`.
- Fichiers a verifier visuellement: favicons, apple-touch icon, icones 192/512, loading screen, home backgrounds, OG cards, icones Electron, Android et iOS.
- HTML et SEO: `index.html`, manifest PWA, JSON-LD, OpenGraph, Twitter cards, sitemap, robots, `llms.txt`.
- Pages publiques: legal, support, press, merch, links, guide et wiki.
- Catalogues i18n, emails et textes de jeu.

Ces elements peuvent etre remplaces en premier si leurs chemins restent compatibles ou passent par un mapping.

### 9.3 Technique mais facilement modifiable avec tests

- `package.json`: nom npm, description, auteur, productName et noms d'artefacts.
- `capacitor.config.ts`: nom visible de l'application.
- PWA manifest et metadata HTML.
- Noms de fichiers et symboles internes Claudium ou WOC qui ne sont ni persistants ni publics.
- Documentation et liens GitHub.

Les noms `.agents/skills/woc-*` et `.codex/agents/woc_*` appartiennent a l'architecture d'agents du depot. Ils ne doivent pas etre renommes dans une phase de rebranding visuel.

### 9.4 Sensible a la compatibilite client

- Electron: `com.worldofclaudecraft.desktop`, `worldofclaudecraft`, `app://worldofclaudecraft`, feed d'update et deep links.
- API interne preload: `window.wocDesktop` et metadonnees associees.
- Mobile: namespaces Android, bundle ID iOS, URL schemes et audiences OAuth.
- Stockage client: cles `woc_*`, dont sessions, settings et choix de compte.
- Routes et headers: `/api/woc/balance`, `x-woc-*`.
- Metriques Prometheus `woc_*`.

Strategie: dual-read, dual-write ou alias pendant une fenetre versionnee. Les anciennes cles ne sont supprimees qu'apres mesure de leur abandon.

### 9.5 Sensible a la base de donnees

- `Claudemoon` est un realm par defaut et un scope de personnages, social et presence. Un nouveau nom sans migration rendrait les donnees existantes invisibles.
- `Eastbrook` est a la fois libelle de contenu et prefixe historique d'infrastructure.
- Claudium, Armory, skins, cosmetics et ownership sont persistants.
- IDs de zones, quetes, items, POI et deeds ne sont pas des textes de presentation.

Strategie: garder l'ID et changer le label, ou migrer par etapes avec alias, backfill et preuve de rollback.

### 9.6 Sensible au reseau ou au deploiement

- Domaines `worldofclaudecraft.com`, sous-domaines dev et updates.
- Emails `noreply@...` et adresses Levy Street.
- OAuth callbacks, CORS, origines desktop et mobile.
- Docker: conteneurs `eastbrook-*`, image, utilisateur et base PostgreSQL `eastbrook`, volumes `eastbrook_*`.
- Deploiement: `/opt/eastbrook`, backups, logs, watchdog et variables `EASTBROOK_*`.
- Variables `WOC_DISTRIBUTION`, `WOC_CRASH_SUBMIT_URL`, `WOC_OPEN_DEVTOOLS`, `WOC_STEAM_*`, `WOC_DAILY_REWARD_*`, `WOC_ECONOMY_*`, `WOC_MINT` et `VITE_WOC_MINT`.

Renommer un volume ou une base Docker sans migration peut donner l'apparence d'une base vide. Les anciens domaines, callbacks et noms de services doivent coexister pendant la bascule.

### 9.7 Web3, boutique et monnaies

- Wallet-standard Solana est actif.
- Le mint WOC configure observe est `3WjLscH2JsXLEFJZRA9z8ti8yRGxWGKbqymPd7UicRth`.
- Variables: `SOLANA_RPC_URL`, `WOC_MINT`, `VITE_WALLET_DISABLED`.
- Endpoints et UI: balance WOC, holder tiers, flair et landing token.
- Claudium est une monnaie soft autoritaire avec service externe, secret, recompense quotidienne, store, Armory et cosmetics.

La decision de conserver, renommer ou retirer Web3 et les monnaies doit etre une phase produit et migration separee. Changer un label n'altere pas un mint. Changer un mint ou un ownership est une migration reseau et de donnees.

## 10. Risques principaux

| Priorite | Risque | Consequence | Controle requis |
|---|---|---|---|
| P0 | Remplacement global de textes | Rupture sauvegardes, protocoles, DB, OAuth, volumes et economie | Classification par occurrence, allowlist d'IDs stables, alias |
| P0 | Carte remplacee sans migration des positions | Personnages dans murs, eau ou hors monde | Migrateur versionne et zone de repli |
| P0 | Asset reutilise sans preuve | Risque de droits et retrait tardif | Registre de provenance par fichier, quarantaine |
| P1 | Identifiant de contenu supprime | Perte ou corruption fonctionnelle de sauvegardes | Append-only, definition retraitee, backfill |
| P1 | Client et serveur de contenu desynchronises | Desync, snapshots invalides, triche involontaire | Release verrouillee et tests de parite |
| P1 | Draco produit par un guide obsolete | GLB impossible a charger en production | Standard Meshopt unique et test structurel |
| P1 | Visuel et collider divergent | Murs invisibles, exploits, LOS incoherente | Test in-game et collider explicite |
| P1 | Routeur HTTP dual non maintenu | Divergence selon drapeau de rollback | Double edition et parite HTTP |
| P1 | `appId`, bundle ID ou deep link renomme brutalement | Nouvelle application, perte de session, callbacks casses | Version de transition et alias |
| P1 | Volumes ou realm renommes comme texte | Donnees apparemment perdues | Backup, migration et double lookup |
| P1 | Ancien binaire relance apres nouvelle ecriture | Perte de champs ou interpretation incorrecte | Test downgrade ou politique forward-only |
| P2 | Densite du nouveau monde accrue | Pression CPU, bandwidth et snapshots | Budget de densite et tests de charge |
| P2 | Gros blobs JSONB non mesures | Amplification d'ecriture et saturation pool | Mesures et limites de taille |
| P2 | Clips ou grips incomplets | Combat illisible et equipement mal place | Preview multi-rig et tests assets |
| P2 | Consommateur statique oublie | Carte, quete, minimap ou serveur divergent | Checklist de zone et tests ciblés |
| P2 | Tests POSIX interpretes comme regressions Windows | Corrections inutiles ou dangereuses | Reproduire sur Linux CI, ne pas corriger depuis Windows |

## 11. Plan complet par phases

Les niveaux de raisonnement recommandes decrivent la profondeur d'analyse, pas un allegement des criteres de validation:

- Moyen: changement local, reversible, contrats connus.
- Eleve: plusieurs couches ou risque de contenu/presentation.
- Tres eleve: simulation, persistance, reseau, securite, economie ou migration.

### Phase 0. Securiser la base et les preuves

- Objectif: figer la baseline, etablir inventaire des droits, IDs et formats de sauvegarde.
- Dossiers: Git, `CREDITS.md`, licences, `public/`, `src/sim/types.ts`, `data.ts`, `server/db.ts`, `docs/`.
- Dependances: acces aux preuves d'achat, comptes de generation, sauvegarde PostgreSQL anonymisee.
- Risques: baseline insuffisante, droits introuvables, donnees personnelles dans les fixtures.
- Raisonnement Codex: tres eleve, avec revues licence, persistance, securite et DB.
- Tests: gate de reference sur Linux, typecheck, build, tests parite, persistance round-trip, inventaire d'IDs, scan malware de release.
- Validation: tag et artefacts reproductibles, registre de provenance par fichier, fixtures anonymisees, restauration DB testee.
- Retour arriere: aucun changement runtime. Supprimer seulement les artefacts locaux non suivis et revenir au worktree baseline, sans toucher au tag.

### Phase 1. Creer le registre de compatibilite

- Objectif: separer labels affiches, IDs persistants, protocoles, cles storage, realms, DB et infrastructure.
- Dossiers: `src/sim/content/`, `src/ui/`, `src/net/`, `server/`, `electron/`, mobile, deploy.
- Dependances: phase 0, inventaire de sauvegardes et contrats publics.
- Risques: identifier a tort un ID comme purement visuel.
- Raisonnement Codex: tres eleve.
- Tests: shipped item IDs, parite de renommage display-only, snapshots, commandes, persistance, deep links, config env et inventaire HTTP.
- Validation: chaque occurrence de marque a un proprietaire, une classe de risque et une strategie.
- Retour arriere: registre documentaire et tests additionnels uniquement, revert atomique possible.

### Phase 2. Rebranding non destructif

- Objectif: remplacer noms visibles, logos, SEO et textes en conservant les IDs techniques.
- Dossiers: HTML, `public/`, `src/ui/`, i18n source, emails et guide.
- Dependances: identite finale, charte, assets licencies et mapping des chemins.
- Risques: cache PWA, texte genere, assets oublies, rupture de lien public.
- Raisonnement Codex: eleve.
- Tests: i18n build/scan, sitemap, manifest PWA, liens, snapshots visuels landing/login/HUD, typecheck et build.
- Validation: aucun ancien logo visible, gameplay et sauvegardes inchanges, anciennes URLs encore redirigees.
- Retour arriere: feature flag ou mapping d'assets, revert des fichiers presentation seulement.

### Phase 3. Mettre en place le remplacement temporaire d'assets

- Objectif: associer a chaque asset un statut droits et un fallback neutre sans supprimer l'original.
- Dossiers: `src/render/assets/`, manifestes characters, `public/models/`, `public/ui/`, `public/audio/`, scripts assets.
- Dependances: registre de provenance et conventions Meshopt.
- Risques: fallback absent au preload, cache, taille de build, confusion entre ancien et nouveau.
- Raisonnement Codex: eleve.
- Tests: asset pipeline, visual manifest, preload, fallback, asset budget, build media manifest et build.
- Validation: chaque asset bloque peut etre remplace par configuration, sans erreur de boot.
- Retour arriere: desactiver le mapping et revenir aux URLs historiques, sans supprimer de fichiers.

### Phase 4. Remplacer un premier personnage test

- Objectif: valider tout le contrat d'un corps joueur sur une classe laboratoire.
- Dossiers: `public/models/chars/`, `manifest.ts`, assets/visual, skins, grips et credits.
- Dependances: modele licencie, clips complets, UV et os main.
- Risques: clips incomplets, hauteur, silhouette, skins, armes et stow.
- Raisonnement Codex: eleve.
- Tests: visual manifest, preload, rig merge, appearance skin, skin event, held weapon, back grips, weapon skins, typecheck et build; previews de tous clips et corps.
- Validation: idle, locomotion, combat, mort, nage, assise, armes, LOD et tiers graphiques valides hors ligne et en reseau.
- Retour arriere: remettre la cle visuelle historique via manifeste, sans toucher au `PlayerClass` ni aux sauvegardes.

### Phase 5. Remplacer un premier ennemi test

- Objectif: valider un swap de creature sans modifier template, IA, stats ou loot.
- Dossiers: `public/models/creatures/` ou `chars/`, manifeste, audio de mob et credits.
- Dependances: rig adapte et clips Idle, Walk, Run, Attack, Hit, Death.
- Risques: silhouette incoherente avec hitbox, attaque illisible, audio original restant.
- Raisonnement Codex: eleve.
- Tests: manifeste/preload/fallback, tests de la famille mob, combat, locomotion, ciblage, LOS, snapshot et build.
- Validation: golden de simulation inchange, rendu et attaque lisibles, serveur autoritaire identique.
- Retour arriere: reassigner l'ancienne cle visuelle.

### Phase 6. Creer une zone laboratoire

- Objectif: construire un petit biome nouveau sans remplacer une zone de production.
- Dossiers: `src/editor/`, `src/sim/map_doc.ts`, nouveau contenu append-only, terrain, rendu et collisions.
- Dependances: limites de l'editeur, props licencies, ID de zone nouveau.
- Risques: consommateurs `ZONES` statiques, frontiere, eau, passage, performance.
- Raisonnement Codex: tres eleve.
- Tests: custom map parity, terrain, rim, walls, water awareness, blockers, map/minimap et player motion.
- Validation: playtest hors ligne stable, aucun changement du monde historique, checklist spatiale complete.
- Retour arriere: desactiver l'enregistrement du laboratoire et conserver son document hors production.

### Phase 7. Rendre le laboratoire autoritaire et y placer des entites

- Objectif: charger la zone cote serveur, puis y dupliquer ou ajouter PNJ et mobs de test.
- Dossiers: `src/sim/data.ts`, contenu, `server/game.ts`, snapshots, presence, quetes cibles.
- Dependances: phase 6 et strategie de deploiement client-serveur verrouillee.
- Risques: ordre RNG des camps, IDs d'entites, snapshots, densite.
- Raisonnement Codex: tres eleve.
- Tests: architecture, world API, command schema, snapshots, bandwidth, presence zone, mob lifecycle, spawn et E2E multijoueur.
- Validation: deux clients voient les memes entites et collisions, sans divergence de simulation.
- Retour arriere: flag serveur supprimant le laboratoire des nouvelles sessions, joueurs relocalises avant retrait.

### Phase 8. Migrer une premiere chaine de quetes

- Objectif: re-ecrire une chaine autonome pour la zone laboratoire avec IDs nouveaux ou labels decouples.
- Dossiers: contenu de quetes, PNJ, mobs, items, `quest_targets.ts`, i18n et guide.
- Dependances: entites et positions stables, decision sur recompenses historiques.
- Risques: prerequis orphelin, marqueur faux, item persistant, texte miroir oublie.
- Raisonnement Codex: tres eleve.
- Tests: quest targets, accept/progress/reward, persist, link/share, i18n, snapshots et sauvegarde round-trip.
- Validation: chaine jouable du debut a la recompense, avant et apres reconnexion, en hors ligne et multijoueur.
- Retour arriere: conserver les anciennes definitions lisibles, stopper seulement les nouvelles acceptations.

### Phase 9. Remplacer progressivement les regions du monde

- Objectif: traiter une region a la fois en livraisons verticales completes.
- Dossiers: zone, terrain, eau, routes, props, colliders, spawns, quetes, carte, minimap, i18n et server.
- Dependances: migrateur de position, laboratoire valide, checklist de section 4.9.
- Risques: sauvegardes, crêtes fixes, POI/deeds, camps RNG, donjons et zones statiques.
- Raisonnement Codex: tres eleve avec revue sim, persistance, cross-platform et DB.
- Tests: tous les tests carte/terrain/quete/zone, parite, snapshots, persistence fixtures, E2E multijoueur et charge de densite.
- Validation: ancienne sauvegarde relocalisee, region complete, aucune reference croisee vers une zone retiree.
- Retour arriere: bascule de version de monde seulement avant migration d'ecriture; apres migration, script inverse prouve ou politique forward-only.

### Phase 10. Reconstruire les donjons

- Objectif: remplacer portes, interieurs, rencontres et narration sans casser l'instancing.
- Dossiers: `src/sim/content/dungeons.ts`, `src/sim/content/temple.ts`, `src/sim/instances/dungeons.ts`, `src/sim/dungeon_layout.ts`, rendu dungeon et assets.
- Dependances: nouvelles portes overworld et compatibilite des lockouts.
- Risques: offsets, sorties, slots, collision, IDs persistants et raids.
- Raisonnement Codex: tres eleve.
- Tests: dungeons, entry clearance, portals, delves, raid lockout, boss encounters, snapshots, persistence et E2E groupe.
- Validation: entree, wipe, reconnexion, sortie, loot et lockout valides pour plusieurs joueurs.
- Retour arriere: garder les anciens layouts et portes derriere version de contenu; relocaliser les joueurs hors instance.

### Phase 11. Remplacer l'interface artistique

- Objectif: nouvelle direction UI, icones et portraits sans changer les commandes.
- Dossiers: `src/ui/`, styles, `public/ui/`, i18n et captures.
- Dependances: remplacement CraftPix, design system et accessibilite.
- Risques: lisibilite combat, mobile, inventaire, mapping d'items et textes tronques.
- Raisonnement Codex: eleve.
- Tests: tests view/painter, accessibilite, pseudo-locale, screenshots desktop/mobile, touch/gamepad, browser et build.
- Validation: toutes fenetres et resolutions supportees, contrastes et input, aucune icone non licenciee.
- Retour arriere: theme ou mapping d'icones versionne.

### Phase 12. Remplacer l'audio

- Objectif: retirer musiques, voix et SFX sans preuve et recreer une identite sonore.
- Dossiers: `public/audio/`, `src/game/music.ts`, `sfx.ts`, voice et combat audio.
- Dependances: catalogue de droits et loudness cible.
- Risques: evenement sans son, volume incoherent, fichiers non manifestes, codecs plateformes.
- Raisonnement Codex: eleve.
- Tests: sfx manifest, loading, conform, runtime pack, voice/events, world audio, build et ecoute sur navigateur/desktop/mobile.
- Validation: aucune source bloquee distribuee, tous cues resolus, pas de clipping ni silence inattendu.
- Retour arriere: manifeste audio par version, fallback silencieux controle plutot que fichier original non autorise.

### Phase 13. Decider et migrer boutique, monnaies et Web3

- Objectif: conserver, renommer ou retirer WOC, Claudium, Armory et integrations wallet.
- Dossiers: UI store/wallet, `server/claudium*.ts`, balance, ownership DB, env et landing.
- Dependances: decision produit, juridique, economique et migration des comptes.
- Risques: mint immuable, soldes, ownership, service externe, routes publiques et promesses joueurs.
- Raisonnement Codex: tres eleve avec securite, persistence et DB.
- Tests: wallet server/browser, balance, store, daily reward, ownership, API, reconciliation DB et E2E comptes.
- Validation: invariants de soldes et ownership prouves, communication et rollback contractuel prepares.
- Retour arriere: conserver anciennes routes et IDs comme alias; aucune double depense; migration forward-only si le ledger change.

### Phase 14. Nettoyer les references originales

- Objectif: retirer les derniers libelles, visuels et assets originaux non requis pour compatibilite.
- Dossiers: depot complet, docs, tests, public, generated sources et deploy.
- Dependances: toutes les phases precedentes et allowlist d'IDs historiques conserves.
- Risques: suppression d'un identifiant encore lu, notices de licence retirees trop tot.
- Raisonnement Codex: eleve.
- Tests: scans de marque/licence, shipped IDs, links, i18n, typecheck, build, gate complet Linux et inventaire media.
- Validation: chaque occurrence restante est documentee comme alias, migration ou notice obligatoire.
- Retour arriere: suppressions en commits atomiques; restauration par revert, jamais par reintroduction d'asset sans droits.

### Phase 15. Valider multijoueur et sauvegardes existantes

- Objectif: prouver autorite, reconnexion, migration et compatibilite sous charge representative.
- Dossiers: `server/`, `src/net/`, `src/sim/`, migrations et fixtures DB.
- Dependances: PostgreSQL jetable, donnees anonymisees et binaires de versions adjacentes.
- Risques: data loss, mixed-version, pool sature, economie dupliquee.
- Raisonnement Codex: tres eleve avec revues persistence, DB, securite et simulation.
- Tests: snapshots, bandwidth, WS auth, leases, linkdead, persistence round-trip, charge mixte, ancien vers nouveau et nouveau vers ancien.
- Validation: aucune perte d'inventaire, quete, monnaie, position ou ownership; SLO de sauvegarde et pool respectes.
- Retour arriere: backup restaure en exercice, drapeaux de lecture/ecriture et runbook forward-only si necessaire.

### Phase 16. Valider navigateur, desktop et mobile

- Objectif: prouver les clients et la continuite d'identite applicative.
- Dossiers: `src/`, `electron/`, `android/`, `ios/`, Capacitor et workflows.
- Dependances: certificats, comptes stores, appareils, macOS et Linux natifs.
- Risques: deep link, updater, OAuth, attestation, safe areas et GPU.
- Raisonnement Codex: tres eleve pour les protocoles, eleve pour la presentation.
- Tests: Vitest browser Chromium, E2E navigateurs cibles, Electron website/Steam, Windows/macOS/Linux, Android et iOS reels.
- Validation: login, update, deep links, sauvegarde, reseau, input, rendu et crash reporting sur chaque cible.
- Retour arriere: conserver ancienne origine, ancien scheme et ancien feed au moins une version de transition; publier une version corrective, pas un downgrade Electron.

### Phase 17. Preparer le deploiement

- Objectif: livrer sans confondre rebranding et migration d'infrastructure.
- Dossiers: Docker, deploy, Caddy, env, CI, observabilite, backups et runbooks.
- Dependances: DNS, TLS, emails, OAuth, DB, capacity proof et rollback exercise.
- Risques: volume orphelin, domaine coupe, callback casse, watchdog POSIX et secret manquant.
- Raisonnement Codex: tres eleve avec securite, release malware, DB et cross-platform.
- Tests: gate complet sur Linux, images Docker, health/readiness, watchdog, restore DB, smoke multiplayer, metriques et canary.
- Validation: checklist go/no-go signee, sauvegarde testee, anciennes URLs redirigees, alertes actives, canary stable.
- Retour arriere: blue/green ou canary, image precedente disponible, DB compatible ou restauration controlee, DNS avec TTL prepare.

## 12. Tests recommandes par phase et type de modification

### 12.1 Socle multiplateforme

A executer pour chaque contribution proportionnellement au scope:

```text
npm run check:types
npm run build
npx vitest run <tests cibles>
```

Le gate canonique final reste `npm run gate` sur l'environnement approprie. Il orchestre generation i18n, securite, tests Node, navigateur, types et builds. Il n'a pas ete lance pendant cet audit documentaire.

### 12.2 Simulation et contrats

```text
tests/architecture.test.ts
tests/world_api_parity.test.ts
tests/command_schema.test.ts
tests/command_facets.test.ts
tests/snapshots.test.ts
tests/parity/
```

Les ecarts de golden doivent etre expliques avant regeneration. Une regeneration ne doit jamais servir a masquer une modification accidentelle de gameplay.

### 12.3 Carte et monde

```text
tests/custom_map_parity.test.ts
tests/terrain_rim_earlyout.test.ts
tests/terrain_walls.test.ts
tests/water_terrain_awareness.test.ts
tests/map_terrain.test.ts
tests/map_window_view.test.ts
tests/map_dungeon_portals.test.ts
tests/minimap_markers.test.ts
tests/blocker_colliders.test.ts
tests/player_motion.test.ts
tests/self_motion.test.ts
tests/subzone.test.ts
tests/presence_zone.test.ts
```

### 12.4 Quetes, spawns et instances

```text
tests/quest_targets.test.ts
tests/quest_progress_persist.test.ts
tests/gather_nodes.test.ts
tests/spirit.test.ts
tests/world_boss.test.ts
tests/dungeon_entry_clearance.test.ts
tests/dungeons.test.ts
tests/delves.test.ts
tests/vale_cup_layout.test.ts
tests/deeds_content.test.ts
```

### 12.5 Modeles et assets

```text
tests/visual_manifest.test.ts
tests/render_asset_preload.test.ts
tests/render_asset_fallback.test.ts
tests/rig_merge.test.ts
tests/rig_merge_assets.test.ts
tests/held_weapon_models.test.ts
tests/back_grips.test.ts
tests/weapon_skins.test.ts
tests/appearance_skin.test.ts
tests/asset_pipeline.test.ts
tests/assets_stats.test.ts
tests/render_glb_replacement_assets.test.ts
tests/static_cache.test.ts
```

Completer par `qa --job`, previews de clips, grips sur plusieurs corps, rendu en jeu et budget media.

### 12.6 Serveur, WebSocket et persistance

```text
tests/snapshots.test.ts
tests/bandwidth.test.ts
tests/ws_backpressure.test.ts
tests/ws_buffer.test.ts
tests/linkdead.test.ts
tests/net_online_visibility_reconnect.test.ts
tests/persistence_round_trip.test.ts
tests/save_character_and_market.test.ts
tests/server/http/
tests/server/*lease*
```

Les tests DB par defaut utilisent mocks et FakeDb. Ils ne prouvent pas PostgreSQL reel.

### 12.7 Tests dependants de Linux, Bash ou POSIX

- `tests/deploy_watchdog.test.ts`: vrai Bash, `bash -n`, `timeout`, permissions, signaux et PATH POSIX. Docker et `flock` y sont simules, donc ce test ne requiert pas un daemon Docker ni un vrai `flock`.
- `tests/codex_setup.test.ts`: lance Bash.
- `tests/sfx_export_bundle.test.ts`: lance `sh` et requiert `sha256sum` ou `shasum`.
- `tests/prod_cpu_monitor.test.mjs`: chmod, symlinks, signaux et permissions POSIX.
- `tests/sfx_overlay.test.ts` et `tests/sfx_studio_server_security.test.ts`: sensibles aux droits de symlink Windows.
- `tests/server/new_endpoint.test.ts`: sensibilite Windows probable pour les binaires `.bin`, a confirmer sur runner.

Ces echecs doivent etre reproduits sur le runner Linux canonique. Ils ne doivent pas etre corriges a l'aveugle depuis Windows.

### 12.8 Tests Docker et PostgreSQL

- Les tests `tests/deploy_*` lisent majoritairement les fichiers comme texte.
- `tests/player_metrics_db_integration.test.ts` exige `TEST_DATABASE_URL` et une base jetable.
- Les validations multijoueur, migrations, restauration et charge exigent Docker/PostgreSQL reels.
- `npm run db:up` et `npm run db:down` modifient l'etat externe et ne font pas partie de cet audit.

### 12.9 Tests navigateur

`npm run test:browser` utilise Vitest Browser et Playwright Chromium. Les scripts E2E et screenshots peuvent exiger un serveur dev, Chrome ou Edge, un serveur de jeu et une base. Pour une phase visuelle, produire des captures desktop et mobile ainsi qu'une preuve interactive.

### 12.10 Validation executee pendant cet audit

Les familles de commandes read-only utilisees pour l'inventaire ont ete:

```text
Get-Content -Raw <AGENTS.md, CLAUDE.md, manifests, sources et licences>
rg --files <surfaces ciblees>
rg -n <symboles, IDs, contrats, chemins et termes de marque>
git grep -I -i -E <termes de marque, domaines, env et economie>
node <inspections read-only des chunks JSON GLB, chemins et Unicode du rapport>
```

Les commandes de baseline et validation ont ete:

```text
git status --short
git branch --show-current
git rev-parse HEAD
git show-ref --tags base-originale
git tag --points-at HEAD
npm run check:types
npm run build
npm run ci:changed
```

Resultats:

- TypeScript et Svelte check reussis.
- Build client reussi.
- Generation i18n, wiki, sitemap, SFX et manifeste media reproductible sans diff suivi.
- `npm run ci:changed` reussi mais n'a selectionne aucun fichier, le rapport etant non suivi et hors des surfaces Biome ciblees.
- Avertissements de build non bloquants: imports admin a la fois statiques et dynamiques, et chunks au-dessus du seuil configure.
- Aucun test Linux, Bash, Docker, PostgreSQL reel, navigateur ou E2E n'a ete lance.

## 13. Strategie Git et retour en arriere

### 13.1 Branches et worktrees

1. Conserver `base-originale` immuable comme point historique.
2. Partir de `codexcraft-rework` uniquement apres synchronisation explicite.
3. Creer un worktree isole par phase ou contribution lorsqu'une autre session partage le checkout.
4. Utiliser des branches courtes, une seule surface coherente par contribution.
5. Ne jamais travailler directement sur la branche partagee.
6. Ne jamais inclure dans un commit les modifications d'une autre session.

### 13.2 Forme des commits futurs

- Commits Conventional Commits scopes au domaine.
- Assets, registre, code et migration regroupes seulement lorsqu'ils forment une unite de rollback.
- Migrations DB et code de lecture compatible livres avant la suppression de l'ancien format.
- Aucun rename massif melange a un changement de gameplay.
- Chaque region ou famille d'assets reste revue et reversible independamment.

### 13.3 Tags et artefacts de controle

Avant chaque bascule majeure:

- tag de release ou commit de reference;
- artefacts de build haches;
- sauvegarde PostgreSQL testee en restauration;
- manifeste de provenance;
- rapport de migrations dry-run;
- resultats du gate Linux et E2E multijoueur;
- inventaire des alias a conserver.

### 13.4 Modes de retour arriere

| Changement | Retour arriere |
|---|---|
| Label ou logo | Revert ou mapping presentation |
| Asset GLB/UI/audio | Rebasculer le manifeste vers un fallback licencie |
| Zone laboratoire | Desactiver le flag et relocaliser les joueurs |
| Region de production | Ancienne version de monde seulement si les donnees restent compatibles; sinon migrateur inverse prouve ou forward-only |
| Route HTTP | `API_DISPATCH=legacy` tant que le bras historique est maintenu |
| Deep link ou domaine | Alias et redirection, jamais coupure immediate |
| Electron | Publier une version corrective superieure, pas un downgrade |
| DB | Restaurer une sauvegarde seulement dans un runbook controle, ou utiliser une migration idempotente |
| Realm/volume Docker | Double lookup et migration; ne jamais renommer le volume comme un simple texte |

### 13.5 Regle de compatibilite des donnees

Tout changement de format suit l'ordre:

```text
lecteur compatible ancien + nouveau
  -> ecriture ou backfill versionne
  -> mesure et verification
  -> arret des nouvelles donnees anciennes
  -> fenetre de compatibilite
  -> retrait eventuel de l'ancien lecteur
```

La suppression directe d'une definition persistante n'est jamais un rollback acceptable.

## 14. Premiere phase d'implementation recommandee

La premiere implementation ne devrait ni rebrander le jeu ni remplacer la carte. Elle devrait creer un socle de transformation verifiable avec trois livrables techniques:

1. Un registre machine-readable de provenance des assets, lie a chaque fichier distribue et a sa preuve.
2. Un registre de compatibilite des identifiants, distinguant label, ID persistant, protocole, stockage client, realm, DB, env et infrastructure.
3. Un jeu de fixtures anonymisees de sauvegardes et de tests de migration, incluant une relocalisation sure de coordonnees.

### Objectif

Transformer les incertitudes les plus dangereuses en contrats testables avant de produire de nouveaux contenus.

### Perimetre conseille

- `docs/` pour les registres et runbooks;
- tests d'inventaire sans changement de gameplay;
- scripts read-only de verification de provenance et IDs;
- fixtures de sauvegarde anonymisees;
- aucune suppression, aucun renommage d'ID et aucun asset nouveau dans cette premiere contribution.

### Criteres de sortie

- Chaque asset distribue est classe reutilisable, a remplacer ou bloque.
- Chaque occurrence de marque sensible a un alias ou une migration planifiee.
- Les IDs persistants sont inventories et proteges par tests.
- Une sauvegarde historique charge et se reserialise sans perte.
- Une position historique peut etre relocalisee de maniere deterministe vers une zone sure dans un test, sans activer encore cette migration.
- Le gate Linux complet, le typecheck et le build passent.
- Une revue licence, persistance, securite et performance DB approuve le passage au rebranding visuel.

Une fois ces criteres atteints, le premier changement visible recommande est la phase 2, rebranding non destructif, suivie de la couche de remplacement d'assets puis d'un seul personnage test. La carte de production ne devrait commencer a changer qu'apres validation de la zone laboratoire autoritaire et du migrateur de sauvegardes.

### Incertitudes restant a lever

- Titulaire exact et transferabilite des achats CraftPix.
- Plans, comptes, prompts et droits des generations Meshy, Tripo, Higgsfield, Recraft, OpenAI et ElevenLabs.
- Provenance des musiques, de la majorite des voix/SFX, CombatMech et modeles quest.
- Version exacte et preuve de licence de certains packs historiques.
- Volumes, cardinalites et tailles JSONB de production.
- Capacite PostgreSQL et multijoueur mesuree, comportement mixed-version et downgrade.
- Continuite des applications store apres changement de bundle ID.
- Strategie produit et juridique pour WOC, Claudium, Armory et wallets.
- Liste exhaustive des consommateurs qui lisent encore `ZONES` ou bornes statiques au lieu du `WorldContent` actif.
- Sensibilite Windows de certains tests POSIX, a confirmer uniquement sur les runners appropries.

Conclusion: le fork peut devenir un nouveau MMORPG en conservant son moteur, mais le chemin fiable est une migration par couches, avec IDs stables, assets traces, zone laboratoire, client et serveur livres ensemble, puis remplacement region par region. Le risque principal n'est pas le rendu. Il reside dans les contrats invisibles entre contenu, coordonnees, sauvegardes, reseau et infrastructure.
