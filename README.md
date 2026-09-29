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
- Test count: `#s-tests` in `index.html`.
- Section text: search for `class="todo"` (yellow highlight) and replace each placeholder, then delete the class.
- Media: add `assets/demo.mp4`, `assets/demo-poster.jpg`, `assets/shot-1..3.png`.
- LinkedIn, live site and BoatAficionado URLs: search for `REPLACE`.
