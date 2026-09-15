/**
 * 다음 기수 개강 안내를 index.html 에 넣는다.
 *
 * 값은 data/schedule.json 에서 읽는다. 개강일이 비어 있거나 이미 지났으면
 * 배너를 만들지 않는다. "7월 일정" 이 가을까지 걸려 있는 상태가
 * 일정이 아예 없는 것보다 나쁘기 때문에, 오래된 날짜는 스스로 사라지게 했다.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const START = '<!--schedule:start-->';
const END = '<!--schedule:end-->';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 한국 시간 기준 오늘 0시 */
function todayKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const label = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const week = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${week})`;
};

function banner(next) {
  if (!next?.개강일) return { html: '', why: '개강일이 비어 있습니다' };

  const start = new Date(`${next.개강일}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return { html: '', why: `개강일 형식 오류: ${next.개강일}` };
  if (start < todayKST()) return { html: '', why: `개강일(${next.개강일})이 이미 지났습니다` };

  const dday = Math.round((start - todayKST()) / 86400000);
  const bits = [
    next.요일시간,
    next.장소,
    next.정원 ? `정원 ${next.정원}명` : null,
  ].filter(Boolean);

  const seats = Number.isInteger(next.잔여석)
    ? `<b class="schedule-seats${next.잔여석 <= 3 ? ' low' : ''}">잔여 ${next.잔여석}석</b>` : '';

  return {
    html: '<div class="schedule-banner">'
      + `<span class="schedule-dday">${dday === 0 ? '오늘 개강' : `개강 D-${dday}`}</span>`
      + '<div class="schedule-body">'
      + `<strong>${esc(next.과정)} ${esc(next.기수)}기 · ${label(next.개강일)} 개강</strong>`
      + (bits.length ? `<span>${esc(bits.join(' · '))}</span>` : '')
      + '</div>'
      + seats
      + '<a class="schedule-cta" href="/apply.html">자리 문의하기 <i aria-hidden="true">→</i></a>'
      + '</div>',
    why: null,
  };
}

export async function updateSchedule(root) {
  const file = path.join(root, 'index.html');
  const [raw, html] = await Promise.all([
    readFile(path.join(root, 'data', 'schedule.json'), 'utf8'),
    readFile(file, 'utf8'),
  ]);
  const { html: inner, why } = banner(JSON.parse(raw).다음기수);

  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s < 0 || e < 0) return { ok: false, why: 'index.html 에 schedule 표시 자리가 없습니다' };

  await writeFile(file, html.slice(0, s + START.length) + inner + html.slice(e), 'utf8');
  return { ok: true, shown: Boolean(inner), why };
}
