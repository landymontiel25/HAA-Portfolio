# HAA Portfolio

Single-page portfolio. Static HTML/CSS plus one Vercel serverless function.

## Deploy on Vercel
1. Import this repo at vercel.com/new (framework preset: Other, no build command).
2. Add environment variable `GITHUB_TOKEN`: a personal access token that can read
   public repo data (fine-grained token, public repositories, no extra permissions needed).
3. Deploy.

## Live numbers
`api/github-stats.js` reads commits, deployments and PR counts for
`landymontiel25/Landmark-Hunters`. Vercel caches the response for 15 minutes
(`s-maxage=900`), so GitHub sees at most a few requests per quarter hour.

## Edit by hand
- Section text: edit `index.html` directly.
- Media: add `assets/demo.mp4`, `assets/demo-poster.jpg`, `assets/shot-1..3.png`.


Live site is deployed on Vercel from `main`.

## Firestore counts
`api/firestore-stats.js` returns document counts for `checkins`, `pick_feedback` and
`landmark_ratings` using the Firebase Admin SDK. Set `FIREBASE_SERVICE_ACCOUNT` in Vercel to the
full service account JSON (as a string). Use a service account limited to read access
(for example the Cloud Datastore Viewer role), because the route is public. Only counts are returned.

## VDate counts
`api/vdate-stats.js` reads `https://vdate-livid.vercel.app/api/public-stats` (counts only, no
names) and passes on the fields the VDate section shows. VDate answers only requests carrying
this site's Origin (`https://haa-portfolio-three.vercel.app`), which the route sends. No
environment variable is needed. Vercel caches the response for 15 minutes with no
stale-while-revalidate. Counts older than 20 minutes at fetch time, or older than 40 minutes when
the page loads, show as "n/a" so old numbers never read as live.

## Look
The page opens on a full-screen hero: a drifting color nebula, a rotating globe of characters
and the name drawn in particles that part around the cursor (all in the hero script in
`index.html`). The tabs' content sits on a dark sheet that slides up over it; a slim tab bar
stays on top once the sheet reaches the top. The hero pauses while the sheet covers it, and
with reduced motion the nebula, globe and name are drawn once and stay still. Tabs: Why Me,
and Projects with Landmark Hunters, BoatAficionado and VDate.

