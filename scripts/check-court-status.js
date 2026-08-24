// Re-checks every tracked property card against the official court auction
// site (courtauction.go.kr) and updates its D-day badge / sold status / price
// to match. Cards without a data-court attribute (case number not verified)
// are left untouched. Requires the `puppeteer` package (bundles Chromium).
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const INDEX_PATH = path.join(__dirname, "..", "index.html");
const SEARCH_URL = "https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml";

function won(n) {
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  let s = "";
  if (eok > 0) s += `${eok}억 `;
  if (man > 0 || eok === 0) s += `${man.toLocaleString("ko-KR")}만원`;
  return s.trim();
}

function pct(minBid, appraisal) {
  return Math.round((minBid / appraisal) * 100);
}

function daysFrom(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

async function checkCase(page, court, year, no) {
  await page.goto(SEARCH_URL, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.select("#mf_wfm_mainFrame_sbx_auctnCsSrchCortOfc", court);
  await page.select("#mf_wfm_mainFrame_sbx_auctnCsSrchCsYear", year);
  await page.click("#mf_wfm_mainFrame_ibx_auctnCsSrchCsNo");
  await page.type("#mf_wfm_mainFrame_ibx_auctnCsSrchCsNo", no);
  await page.click("#mf_wfm_mainFrame_btn_auctnCsSrchBtn");
  await new Promise((r) => setTimeout(r, 3000));

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes("잘못된 번호") || bodyText.includes("검색된 정보가 없습니다")) {
    return null;
  }

  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("a, button, span, li")).find(
      (e) => e.textContent.trim() === "기일내역"
    );
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  const giilText = await page.evaluate(() => document.body.innerText);
  // rows look like: 2026.09.22(10:00)  매각기일  ...  354,900,000원  <result>
  const rowRe = /(\d{4})\.(\d{2})\.(\d{2})\([\d:]+\)\s*매각기일[^\n]*?([\d,]+)원\s*(유찰|매각|변경|취하|취소)?/g;
  const appraisalMatch = giilText.match(/([\d,]+)원\s*\n?\d{4}\.\d{2}\.\d{2}\([\d:]+\)\s*매각기일/);
  const appraisal = appraisalMatch ? Number(appraisalMatch[1].replace(/,/g, "")) : null;

  let m;
  let lastSold = null;
  let nextActive = null;
  while ((m = rowRe.exec(giilText))) {
    const [, y, mo, d, priceStr, result] = m;
    const price = Number(priceStr.replace(/,/g, ""));
    const date = `${y}-${mo}-${d}`;
    if (result === "매각") lastSold = { date, price };
    else if (!result) nextActive = { date, price }; // blank result = upcoming
  }

  if (lastSold && !nextActive) {
    return { status: "sold", soldPrice: lastSold.price, appraisal };
  }
  if (nextActive) {
    return { status: "active", date: nextActive.date, minBid: nextActive.price, appraisal };
  }
  return null;
}

function replaceCard(html, name, updater) {
  const idx = html.indexOf(`alt="${name}"`);
  if (idx === -1) return html;
  const start = html.lastIndexOf("<article", idx);
  const end = html.indexOf("</article>", idx) + "</article>".length;
  const card = html.slice(start, end);
  const updated = updater(card);
  if (updated === card) return html;
  return html.slice(0, start) + updated + html.slice(end);
}

async function main() {
  let html = fs.readFileSync(INDEX_PATH, "utf8");

  const cards = [
    ...html.matchAll(
      /<article class="property-feed-card[^"]*" data-region="대구"(?: data-court="([^"]+)")?><a class="property-feed-link" href="[^"]*"[^>]*><div class="property-feed-visual"[^>]*>(?:<div class="sold-out-stamp">[^<]*<\/div>)?<img[^>]*alt="([^"]+)"/g
    ),
  ].map((m) => ({ court: m[1], name: m[2] }));

  const withCourt = cards.filter((c) => c.court);
  console.log(`found ${cards.length} cards, ${withCourt.length} have verified case numbers`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  let changed = 0;
  for (const c of withCourt) {
    // pull case number from this card's CTA text
    const nameIdx = html.indexOf(`alt="${c.name}"`);
    const cardStart = html.lastIndexOf("<article", nameIdx);
    const cardEnd = html.indexOf("</article>", nameIdx) + "</article>".length;
    const cardHtml = html.slice(cardStart, cardEnd);
    const caseMatch = cardHtml.match(/(\d{4})타경(\d+)/);
    if (!caseMatch) continue;
    const [, year, no] = caseMatch;

    let result;
    try {
      result = await checkCase(page, c.court, year, no);
    } catch (e) {
      console.log(`  ${c.name}: fetch error (${e.message}), skipping`);
      continue;
    }
    if (!result) {
      console.log(`  ${c.name}: no parseable result, skipping`);
      continue;
    }

    if (result.status === "sold") {
      html = replaceCard(html, c.name, (card) => {
        if (card.includes("is-sold-out")) {
          // already sold; just refresh the displayed price if it changed
          return card.replace(
            /(<div class="property-feed-price"><small>[^<]*<\/small><strong>)[^<]*(<\/strong>)/,
            `$1${won(result.soldPrice)}$2`
          );
        }
        changed++;
        let out = card;
        out = out.replace(/^<article class="property-feed-card([^"]*)"/, (m2, cls) => `<article class="property-feed-card${cls} is-sold-out"`);
        out = out.replace(
          /<time class="[^"]*">[^<]*<\/time>|<time>[^<]*<\/time>/,
          `<time class="badge-sold">낙찰완료</time>`
        );
        out = out.replace(/<span>아파트 · [^<]*<\/span>/, `<span>아파트 · 낙찰완료</span>`);
        out = out.replace(
          /(<div class="property-feed-price"><small>[^<]*<\/small><strong>)[^<]*(<\/strong>)/,
          `$1${won(result.soldPrice)}$2`
        );
        if (!out.includes("sold-out-stamp")) {
          out = out.replace(
            '<div class="property-feed-visual">',
            '<div class="property-feed-visual"><div class="sold-out-stamp">낙찰완료</div>'
          );
        }
        return out;
      });
    } else {
      html = replaceCard(html, c.name, (card) => {
        const wasSold = card.includes("is-sold-out");
        let out = card;
        if (wasSold) {
          changed++;
          out = out.replace(/^<article class="property-feed-card([^"]*) is-sold-out"/, `<article class="property-feed-card$1"`);
          out = out.replace(/<div class="sold-out-stamp">[^<]*<\/div>/, "");
        }
        const days = daysFrom(result.date);
        const urgent = days <= 7 ? " urgent" : "";
        out = out.replace(
          /<time class="[^"]*">[^<]*<\/time>|<time>[^<]*<\/time>/,
          `<time class="badge-dday${urgent}">D-${days}</time>`
        );
        if (result.appraisal) {
          const p = pct(result.minBid, result.appraisal);
          out = out.replace(/<span>아파트 · [^<]*<\/span>/, `<span>아파트 · 감정가의 ${p}%</span>`);
        }
        out = out.replace(
          /(<div class="property-feed-price"><small>[^<]*<\/small><strong>)[^<]*(<\/strong>)/,
          `$1${won(result.minBid)}$2`
        );
        return out;
      });
    }
  }

  await browser.close();

  fs.writeFileSync(INDEX_PATH, html, "utf8");
  console.log(`done. ${changed} card(s) moved between active/sold.`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
