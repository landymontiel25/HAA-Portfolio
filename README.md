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

## Edit mode
Press the name at the top of the page and turn on **Edit Mode** in the menu that opens,
then click any text and type. There is no password, by the owner's choice: anyone who finds
the switch can submit an edit, and GitHub history is how to undo one. Enter adds a new
paragraph (or list item) below; emptying a block removes it. **Submit** commits the change
to `index.html` on `main` and Vercel redeploys in about a minute. Turning the switch off
(or Cancel) throws away changes not yet submitted, after asking. The editor script loads only
when the switch is turned on.

Every editable block carries `data-edit="tN"` in `index.html`; `api/edit.js` uses it to find
the block. Live numbers, links/buttons, images, the menus and the name are not editable. Only text and
bold, italic, links and code are accepted.

Vercel environment variable:
- `GITHUB_EDIT_TOKEN`: a fine-grained GitHub token for `landymontiel25/HAA-Portfolio` only,
  with **Contents: Read and write**. Edits are commits made with this token.

**Before sending the portfolio to reviewers: remove edit mode.** With no password, anyone
can edit the live site. To remove it: delete `GITHUB_EDIT_TOKEN` in Vercel (this alone stops
all saving), and delete the name menu, its script in `index.html`, `edit.js` and
`api/edit.js` (or ask Claude to).

## Look
The page opens on a full-screen hero: a drifting color nebula, a rotating globe of characters
and the name drawn in particles that part around the cursor (all in the hero script in
`index.html`). The tabs' content sits on a dark sheet that slides up over it; a slim tab bar
stays on top once the sheet reaches the top. The hero pauses while the sheet covers it, and
with reduced motion the nebula, globe and name are drawn once and stay still. Tabs: Why Me,
and Projects with Landmark Hunters, BoatAficionado and VDate.

## Password gate
`middleware.js` (Vercel Routing Middleware) puts a password page in front of the whole site,
including files and `/api` routes. It is off until `SITE_PASSWORD` is set in Vercel
(Settings → Environment Variables, Production and Preview, then redeploy). The right password
sets an HttpOnly cookie for 30 days. Change `SITE_PASSWORD` to sign everyone out; delete it to
make the site public again.
