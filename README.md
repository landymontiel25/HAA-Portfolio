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
