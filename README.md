# Colbert en lutte

Plateforme d'organisation de la mobilisation — Faculté Colbert & Îlot Bernard du Bois (Marseille).

- `docs/` : le site (HTML/CSS/JS, aucune compilation). Publié tel quel (GitHub Pages, Netlify, Vercel…).
- `supabase/schema.sql` : base de données, sécurité (RLS), temps réel. À exécuter une fois dans Supabase.

## Mode démo
Si `docs/js/config.js` est vide, le site tourne en **démo** : données fictives stockées dans le navigateur.

## Mise en ligne (≈ 15 min)
1. **Supabase** (gratuit) → New project → région *West EU (Paris)* ou *Central EU (Frankfurt)*.
2. *SQL Editor* → coller `supabase/schema.sql` → **Run**.
3. *Authentication → Sign In / Providers → Email* : désactiver **Confirm email**.
4. *Authentication → Rate Limits* : monter « sign-ups and sign-ins » (ex. 300 / 5 min), sinon une amphi entière sur le même wifi sera bloquée.
5. *Project Settings → API* : copier **Project URL** et la clé **anon / publishable** dans `docs/js/config.js`.
6. Publier le dossier `docs/` (GitHub Pages : *Settings → Pages → Branch main / folder /docs*).
7. Ouvrir le site et **créer ton compte en premier** : le premier compte devient automatiquement admin.

## Sécurité
- Prénom/nom stockés dans la table `identities`, lisible uniquement par l'admin (RLS côté serveur).
- La clé « anon » est publique par conception : toute la sécurité est dans les règles RLS du schéma.
- Votes anonymes : chacun ne peut lire que son propre vote ; seuls les totaux sont exposés.
- Journal de modération (`audit_log`) lisible par l'admin.

## Limites de l'offre gratuite Supabase
200 connexions temps réel simultanées. Le site libère la connexion d'un onglet resté 10 min en arrière-plan et recharge les données toutes les 90 s en secours. Au-delà de ~200 personnes connectées en même temps : passer au plan Pro (25 $/mois, 500 connexions).
