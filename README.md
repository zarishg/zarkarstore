# Zarkar Studio store (GitHub + Vercel)

Full store: storefront, cart and checkout, order tracking, admin panel at /admin.

## Put it live
1. Upload every file of all 3 parts to ONE GitHub repository (keep the folders: api, lib, public, public/img/...).
2. On vercel.com: Add New > Project > choose the repository. Framework Preset: Other. Leave the build settings empty. Deploy.
3. In the Vercel project open Storage > Create Database > Neon (Postgres) > connect it to the project. This adds DATABASE_URL by itself.
4. In Settings > Environment Variables add:
   - ADMIN_PASSWORD  (a long password of your own; the admin panel stays switched off without it)
   - Optional: SESSION_SECRET (any long random text), WHATSAPP_NUMBER, CONTACT_EMAIL, BASE_URL (your store address), STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
5. Deployments > Redeploy. Open your store, then /admin and sign in.

Product photos you add in the admin are stored in the database (up to 4 MB each).
