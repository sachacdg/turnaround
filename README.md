# Turnaround — v1 publique

> **Turnaround** est une application web de suivi d’escale destinée à regrouper, dans une interface unique, les principales informations utiles à la préparation d’un vol, au suivi des passagers et à la coordination du départ.

- **Application web :** https://turnaround-ddn6.onrender.com
- **Dépôt du projet :** https://github.com/sachacdg/turnaround
- **Version documentée :** v1 publique

---

## 1. Présentation du projet

Une escale demande de suivre plusieurs informations dans un temps limité : les données du vol, les horaires, la préparation cabine, l’embarquement et les heures liées au départ.

Turnaround vise à faciliter cette lecture en réunissant les informations principales dans un tableau de bord. L’application est notamment adaptée à l’organisation d’une escale en simulation aérienne et à la consultation rapide des données opérationnelles.

> **Capture d’écran — vue générale du Dashboard**  
> *Insérer ici une capture d’écran du Dashboard complet.*

---

## 2. Fonctions principales

### Tableau de bord du vol

Le Dashboard regroupe les informations essentielles du vol et présente une vue synthétique des horaires et des éléments suivis pendant l’escale.

**Capture d’écran — bandeau du Dashboard**  
*Insérer ici une capture du bandeau Départ / indicateur central / Arrivée.*

### Import des données SimBrief

Lorsque le dossier de vol SimBrief est disponible et que la fonction d’import est opérationnelle, les données du briefing peuvent servir à renseigner le vol sans devoir tout saisir manuellement.

Les informations importées doivent être vérifiées, notamment le type d’appareil, les horaires et le nombre de passagers.

**Capture d’écran — vol importé depuis SimBrief**  
*Insérer ici une capture du vol chargé.*

### TOBT, TSAT et CTOT

Le Dashboard permet de consulter les informations de départ disponibles :

- **TOBT** — Target Off-Block Time : heure cible à laquelle l’avion doit être prêt à quitter son poste.
- **TSAT** — Target Start-up Approval Time : heure cible d’autorisation de mise en route.
- **CTOT** — Calculated Take-Off Time : créneau calculé de décollage, lorsqu’il est fourni.

Le comportement des données dépend de la disponibilité de vIFF et de la configuration du service. La TOBT peut être saisie dans l’interface et envoyée à vIFF si la connexion correspondante fonctionne. Une valeur affichée ne doit pas être considérée comme confirmée par un service externe tant que son retour n’a pas été vérifié.

**Capture d’écran — fenêtre TOBT / envoi à vIFF**  
*Insérer ici une capture de la fenêtre de saisie et du bouton « Envoyer ».*

### Estimation du bloc arrivée et indicateur d’écart

Le Dashboard peut comparer deux estimations d’arrivée calculées à partir des horaires disponibles et du Block Time. L’indicateur circulaire est une représentation visuelle de l’écart, pas un compte à rebours en temps réel.

Dans la configuration prévue :
- vert : écart nul ou négatif ;
- orange : écart positif inférieur à 15 minutes ;
- rouge : écart de 15 minutes ou plus.

**Capture d’écran — indicateur central et bloc arrivée**  
*Insérer ici une capture montrant l’indicateur et l’heure d’arrivée estimée.*

### Suivi des passagers et capacité cabine

Le module passagers permet de suivre le nombre de passagers et l’avancement de l’embarquement, ainsi que les places restantes selon la capacité de référence configurée pour le type d’appareil.

Si le nombre de passagers importé depuis SimBrief dépasse la capacité de référence connue, un avertissement peut être affiché. Cet avertissement signale une incohérence potentielle, sans remplacer la vérification de la configuration réelle de la cabine.

**Capture d’écran — tableau PAX / capacité cabine**  
*Insérer ici une capture du module passagers.*

### Autres informations de préparation

Selon les fonctions disponibles dans la version utilisée, l’application peut également présenter des informations de masse et centrage, des données de vol, des éléments de suivi et des outils de préparation complémentaires.

**Capture d’écran — autre module utilisé**  
*Insérer ici une capture d’un module pertinent.*

---

## 3. Accessibilité et conditions d’utilisation

- **Accès web :** l’application s’utilise depuis un navigateur compatible, sans installation classique sur ordinateur.
- **Écrans :** elle est principalement pensée pour une utilisation sur ordinateur ou tablette ; l’affichage peut varier selon la taille de l’écran.
- **Accès public :** la version publique est accessible à l’adresse indiquée plus haut, sous réserve de disponibilité du service.
- **Services externes :** les fonctions liées à SimBrief ou vIFF dépendent de leur disponibilité, des autorisations et de la configuration en place.
- **Vérification des données :** les valeurs importées, calculées ou saisies doivent être contrôlées par l’utilisateur.

L’interface ne remplace pas les procédures officielles d’un exploitant, les systèmes certifiés ni les validations opérationnelles applicables.

---

## 4. Exemple de workflow pendant une escale

*Exemple fictif, donné à titre illustratif.*

1. **Ouvrir Turnaround**  
   Accéder à l’application depuis un navigateur et ouvrir le Dashboard.

2. **Charger le vol**  
   Importer le dossier SimBrief si cette fonction est disponible. Vérifier le numéro de vol, les aéroports, le type d’appareil, les horaires et le nombre de passagers.

3. **Contrôler les données cabine**  
   Vérifier la capacité de référence et la répartition des passagers. Examiner tout avertissement de dépassement et confirmer les données utilisées.

4. **Suivre l’embarquement**  
   Mettre à jour ou consulter le nombre de passagers embarqués et les places restantes, en fonction des informations disponibles pendant l’escale.

5. **Consulter les heures de départ**  
   Vérifier l’OBT/TOBT, la TSAT et, si elle est disponible, la CTOT. Si une TOBT doit être transmise à vIFF, utiliser la commande d’envoi puis vérifier le retour du service.

6. **Consulter l’estimation d’arrivée**  
   Lire l’heure d’arrivée estimée et l’indicateur d’écart comme une aide visuelle. L’indicateur ne constitue pas un chronomètre réel.

7. **Effectuer le contrôle final**  
   Vérifier les informations du vol et les données affichées avant de considérer le suivi de l’escale comme terminé.

**Capture d’écran — exemple de workflow**  
*Insérer ici une capture montrant le Dashboard à un moment représentatif de l’escale.*

---

## 5. Limites et bonnes pratiques

- Les capacités cabine génériques peuvent différer de la configuration réelle d’une compagnie.
- Les données SimBrief dépendent du dossier importé et peuvent nécessiter une correction.
- Les données vIFF dépendent de la connexion et de la disponibilité du service externe.
- Une valeur affichée localement ne signifie pas nécessairement qu’elle a été transmise ou confirmée par un système externe.
- Les captures d’écran publiées doivent masquer les données personnelles, identifiants, jetons et autres informations sensibles.

## 6. Signaler un problème

Pour signaler un bug ou proposer une amélioration, utiliser la page Issues du dépôt :

https://github.com/sachacdg/turnaround/issues

Inclure, si possible, les étapes pour reproduire le problème, le navigateur utilisé et la fonction concernée. Ne pas publier de clés d’API, de mots de passe ou d’autres informations sensibles.

---

## Avertissement

Turnaround est un outil d’assistance à l’organisation et à la simulation. Il ne constitue pas un système certifié de gestion des opérations aériennes et ne doit pas être utilisé comme source unique pour une décision liée à la sécurité ou à l’exploitation réelle d’un aéronef.
