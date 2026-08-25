const fs = require("fs");
const pages = require("../daegu_apt_raw.json");
const fullText = pages.join("\n");

const chunks = fullText.split(/(?=대구지방법원\d{4}타경\d+|대구서부지원\d{4}타경\d+)/).slice(1);

const records = [];
for (const chunk of chunks) {
  const courtMatch = chunk.match(/^(대구지방법원|대구서부지원)/);
  // case number appears cleanly on its own line after the court name;
  // the leading label can be two case numbers glued together for 중복 cases.
  const caseMatch = chunk.match(/\n(\d{4})타경(\d+)[\t\n]/);
  if (!courtMatch || !caseMatch) continue;

  const addrMatch = chunk.match(/\d+\t\n([\s\S]*?)\t지도/);
  const noteMatch = chunk.match(/\t지도\t([^\t]*)\t/);
  const appraisalMatch = chunk.match(/\t지도\t[^\t]*\t([\d,]+)\t/);
  const deptMatch = chunk.match(/(경매\d+계)/);
  const dateMatch = chunk.match(/(\d{4}\.\d{2}\.\d{2})/);
  const minBidMatch = chunk.match(/아파트\t\n([\d,]+)\n\((\d+)%\)/);
  const statusMatch = chunk.match(/\(\d+%\)\s*\t([^\n]+)/);

  if (!addrMatch || !appraisalMatch || !minBidMatch || !statusMatch) continue;

  records.push({
    court: courtMatch[1],
    year: caseMatch[1],
    caseNo: `${caseMatch[1]}타경${caseMatch[2]}`,
    address: addrMatch[1].replace(/\s+/g, " ").trim(),
    note: (noteMatch ? noteMatch[1] : "").trim(),
    appraisal: Number(appraisalMatch[1].replace(/,/g, "")),
    dept: deptMatch ? deptMatch[1] : null,
    saleDate: dateMatch ? dateMatch[1] : null,
    minBid: Number(minBidMatch[1].replace(/,/g, "")),
    pct: Number(minBidMatch[2]),
    status: statusMatch[1].trim(),
  });
}

console.log("parsed records:", records.length, "of", chunks.length, "chunks");
fs.writeFileSync("c:/Users/PC/ykp_edu/daegu_apt_parsed.json", JSON.stringify(records, null, 1), "utf8");

const oneFailed = records.filter((r) => r.status === "유찰 1회");
console.log("유찰 1회 count:", oneFailed.length);
oneFailed.forEach((r) => {
  console.log(`${r.caseNo} | ${r.address} | 감정가 ${r.appraisal.toLocaleString()} | 최저가 ${r.minBid.toLocaleString()}(${r.pct}%) | ${r.saleDate} | ${r.dept}${r.note ? " | 비고:" + r.note : ""}`);
});
