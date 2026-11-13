// =====================================================================
//  CONFIGURATION — à remplir lors de la mise en ligne.
//  Laisser vide = MODE DÉMO (données fictives dans le navigateur).
//  La clé « anon » est publique par conception : la sécurité repose sur les règles RLS du schéma.
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: "https://ktdvymqrwjpefzvflnxj.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZ5bXFyd2pwZWZ6dmZsbnhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NTk4NzYsImV4cCI6MjExMDEzNTg3Nn0.pgbh1yL0kpXRbh9FCxo_6DfT_gi-HMDyQ3vjUIqk2ns",
  // Domaine technique utilisé pour transformer un pseudo en identifiant de connexion.
  // Aucun email n'est jamais envoyé ni demandé.
  EMAIL_DOMAIN: "membres.colbert-en-lutte.fr",
};
