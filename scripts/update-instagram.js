// Fetches the latest Instagram posts for @ykphone_edu via Apify, excludes pinned
// posts, sorts by real upload date, and rebuilds the .instagram-grid section with
// the newest 9. Requires APIFY_TOKEN in the environment. Fail-safe: if the fetch
// fails or too few valid posts come back, index.html is left untouched.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "index.html");
const IMG_DIR = path.join(ROOT, "assets/instagram");
const TARGET_COUNT = 9;
const MIN_REQUIRED = 6; // don't publish a noticeably thinner grid than usual

async function fetchPosts() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: ["https://www.instagram.com/ykphone_edu/"],
        resultsType: "posts",
        resultsLimit: 20,
      }),
    }
  );
  if (!res.ok) throw new Error(`Apify request failed: ${res.status}`);
  return res.json();
}

async function downloadImage(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTile(post, i) {
  const num = String(i + 1).padStart(2, "0");
  const caption = (post.caption || "").split("\n")[0].slice(0, 80);
  const alt = escapeAttr(caption);
  return (
    `<a class="instagram-tile" href="${post.url}" target="_blank" rel="noreferrer" aria-label="${alt}">` +
    `<img src="assets/instagram/post-${num}.jpg" alt="${alt}" loading="lazy"/>` +
    `<span class="instagram-tile-number">${num}</span>` +
    `<div class="instagram-tile-overlay"><b>♥</b><strong>${post.likesCount ?? 0}</strong><small>댓글 ${post.commentsCount ?? 0}개</small></div>` +
    `</a>`
  );
}

async function main() {
  const posts = await fetchPosts();
  const candidates = posts
    .filter((p) => !p.isPinned && p.displayUrl && p.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, TARGET_COUNT);

  console.log(`fetched ${posts.length} posts, ${candidates.length} usable after filtering`);

  if (candidates.length < MIN_REQUIRED) {
    console.log(`only ${candidates.length} usable posts (< ${MIN_REQUIRED}), leaving index.html untouched`);
    return;
  }

  for (let i = 0; i < candidates.length; i++) {
    const num = String(i + 1).padStart(2, "0");
    await downloadImage(candidates[i].displayUrl, path.join(IMG_DIR, `post-${num}.jpg`));
  }

  const newGrid = `<div class="instagram-grid">${candidates.map(buildTile).join("")}</div>`;

  let html = fs.readFileSync(INDEX_PATH, "utf8");
  const start = html.indexOf('<div class="instagram-grid">');
  if (start === -1) throw new Error("instagram-grid not found in index.html");

  // Locate the matching closing </div> for the grid by counting nested divs from start.
  let depth = 0;
  let gridEnd = -1;
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = start;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        gridEnd = m.index + m[0].length;
        break;
      }
    } else {
      depth++;
    }
  }
  if (gridEnd === -1) throw new Error("could not find end of instagram-grid");

  html = html.slice(0, start) + newGrid + html.slice(gridEnd);
  fs.writeFileSync(INDEX_PATH, html, "utf8");
  console.log(`updated instagram-grid with ${candidates.length} posts`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
