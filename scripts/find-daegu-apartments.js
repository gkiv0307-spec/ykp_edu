// Searches courtauction.go.kr's 물건상세검색 for Daegu apartment auction
// listings and prints only the ones currently at exactly one failed round
// (진행상태 === "유찰 1회") — the safer, more-vetted tier the user asked for.
const puppeteer = require("puppeteer");

const SEARCH_URL = "https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151F00.xml";
const TARGET_STATUS = "유찰 1회";

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1200 });
  await page.goto(SEARCH_URL, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  await page.click("#mf_wfm_mainFrame_rad_rletSrchBtn_input_1");
  await new Promise((r) => setTimeout(r, 800));
  await page.select("#mf_wfm_mainFrame_sbx_rletAdongSdS", "대구광역시");
  await new Promise((r) => setTimeout(r, 1200));
  await page.select("#mf_wfm_mainFrame_sbx_rletLclLst", "건물");
  await new Promise((r) => setTimeout(r, 1000));
  await page.select("#mf_wfm_mainFrame_sbx_rletMclLst", "주거용건물");
  await new Promise((r) => setTimeout(r, 1000));
  const sclOptions = await page.evaluate(() =>
    Array.from(document.getElementById("mf_wfm_mainFrame_sbx_rletSclLst").options).map((o) => ({
      v: o.value,
      t: o.textContent.trim(),
    }))
  );
  const apt = sclOptions.find((o) => o.t.includes("아파트"));
  await page.select("#mf_wfm_mainFrame_sbx_rletSclLst", apt.v);
  await new Promise((r) => setTimeout(r, 800));

  // show 40 rows per page to minimize pagination clicks
  await page.click("#mf_wfm_mainFrame_btn_gdsDtlSrch");
  await new Promise((r) => setTimeout(r, 4000));

  const totalText0 = await page.evaluate(() => document.body.innerText);
  const totalMatch = totalText0.match(/총 물건수(\d+)건/);
  console.log("total listings found:", totalMatch ? totalMatch[1] : "unknown");

  const pageTexts = [];
  let pageNum = 1;
  while (pageNum <= 10) {
    const text = await page.evaluate(() => {
      const marker = document.body.innerText.indexOf("물건번호,소재지");
      return marker === -1 ? "" : document.body.innerText.slice(marker);
    });
    pageTexts.push(text);
    const clicked = await page.evaluate((n) => {
      const els = Array.from(document.querySelectorAll("a, span"));
      const target = els.find((el) => el.textContent.trim() === String(n));
      if (target) {
        target.click();
        return true;
      }
      return false;
    }, pageNum + 1);
    if (!clicked) break;
    pageNum++;
    await new Promise((r) => setTimeout(r, 2500));
  }

  await browser.close();

  const fs = require("fs");
  fs.writeFileSync(
    require("path").join(__dirname, "..", "daegu_apt_raw.json"),
    JSON.stringify(pageTexts, null, 1),
    "utf8"
  );
  console.log("pages captured:", pageTexts.length);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
