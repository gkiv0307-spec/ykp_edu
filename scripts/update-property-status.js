// Fetches the 매각기일 (auction sale date) mentioned in each linked blog post
// for every card in .property-feed-grid, then marks the card as an upcoming
// D-day countdown or as sold out ("낙찰완료") if that date has passed.
// Best-effort: if no date can be found in the post text, the card is left untouched.
const fs = require("fs");
const path = require("path");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

function extractSaleDate(text) {
  const withRound = text.match(
    /(\d+)차\s*매각기일[^0-9]{0,20}(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/
  );
  const m =
    withRound ||
    text.match(/매각기일[^0-9]{0,20}(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  const [y, mo, d] = withRound ? m.slice(2) : m.slice(1);
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function toPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function daysUntil(saleDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(saleDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

async function fetchSaleDate(postUrl) {
  const idMatch = postUrl.match(/\/(\d+)(?:\?|$)/);
  if (!idMatch) return null;
  const mobileUrl = `https://m.blog.naver.com/ykphone_edu/${idMatch[1]}`;
  const res = await fetch(mobileUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  return extractSaleDate(toPlainText(html));
}

function applyStatusToCard(cardHtml, status) {
  let out = cardHtml;
  if (status.kind === "active") {
    const label = `D-${status.days}`;
    const urgentClass = status.days <= 7 ? " urgent" : "";
    out = out.replace(
      /<time class="[^"]*">[^<]*<\/time>|<time>[^<]*<\/time>/,
      `<time class="badge-dday${urgentClass}">${label}</time>`
    );
  } else if (status.kind === "sold") {
    out = out.replace(
      /<time class="[^"]*">[^<]*<\/time>|<time>[^<]*<\/time>/,
      `<time class="badge-sold">낙찰완료</time>`
    );
    out = out.replace(
      /^<article class="property-feed-card([^"]*)"/,
      (m, cls) =>
        cls.includes("is-sold-out")
          ? m
          : `<article class="property-feed-card${cls} is-sold-out"`
    );
    if (!out.includes("sold-out-stamp")) {
      out = out.replace(
        '<div class="property-feed-visual">',
        '<div class="property-feed-visual"><div class="sold-out-stamp">낙찰완료</div>'
      );
    }
  }
  return out;
}

async function main() {
  let html = fs.readFileSync(INDEX_PATH, "utf8");
  const gridStart = html.indexOf('<div class="property-feed-grid">');
  const gridEnd = html.indexOf("</section>", gridStart);
  if (gridStart === -1 || gridEnd === -1) {
    throw new Error("property-feed-grid not found");
  }

  const hrefs = [
    ...html
      .slice(gridStart, gridEnd)
      .matchAll(
        /property-feed-link" href="(https:\/\/blog\.naver\.com\/ykphone_edu\/\d+)"/g
      ),
  ].map((m) => m[1]);

  console.log(`found ${hrefs.length} cards`);

  for (const href of hrefs) {
    const cardStart = html.lastIndexOf("<article", html.indexOf(`href="${href}"`));
    const cardEnd = html.indexOf("</article>", cardStart) + "</article>".length;
    const cardHtml = html.slice(cardStart, cardEnd);

    let status = { kind: "unknown" };
    try {
      const saleDate = await fetchSaleDate(href);
      if (saleDate) {
        const days = daysUntil(saleDate);
        status = days > 0 ? { kind: "active", days } : { kind: "sold" };
      }
    } catch (e) {
      console.log("  fetch failed for", href, e.message);
    }

    console.log(href, "->", status);

    const updatedCard = applyStatusToCard(cardHtml, status);
    if (updatedCard !== cardHtml) {
      html = html.slice(0, cardStart) + updatedCard + html.slice(cardEnd);
    }
  }

  fs.writeFileSync(INDEX_PATH, html, "utf8");
  console.log("done");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
