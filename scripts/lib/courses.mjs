/**
 * index.html 의 과정 카드에서 수강 과정 정보를 읽어 온다.
 *
 * 과정 내용을 이 파일에 또 적어두지 않는 이유:
 * 수강료나 커리큘럼이 바뀔 때 두 곳을 고쳐야 하면 반드시 한쪽이 뒤처진다.
 * index.html 을 유일한 출처로 두고 나머지 페이지는 여기서 만들어 쓴다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/* 카드 id → 페이지 주소에 쓸 이름 */
const SLUGS = {
  'course-beginner': 'beginner',
  'course-intermediate': 'intermediate',
  'course-advanced': 'advanced',
  'course-coaching': 'coaching',
  'course-consulting': 'consulting',
};

const text = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export async function readCourses(root) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const cards = [...html.matchAll(/<article class="course-card([^"]*)" id="([^"]+)">([\s\S]*?)<\/article>/g)];

  return cards.map(([, cls, id, body]) => {
    const title = body.match(/<div class="course-title"><h3>([^<]+)<\/h3><p>([^<]*)<\/p>/);
    const meta = [...body.matchAll(/<small>(진행 방식|기간)<\/small><strong>([^<]+)<\/strong>/g)];

    const single = body.match(/<div class="course-price"><strong>([^<]+)<\/strong><span>([^<]*)<\/span>/);
    const optionBlock = body.match(/<div class="course-price-options">([\s\S]*?)<\/div>\s*<div class="course-goal"/);
    const optionPrices = optionBlock
      ? [...optionBlock[1].matchAll(/<small>([^<]+)<\/small><strong>([^<]+)<\/strong><span>([^<]*)<\/span>/g)]
        .map((m) => ({ label: m[1], price: m[2], note: text(m[3]) }))
      : [];

    const audienceBlock = body.match(/<div class="course-audience">([\s\S]*?)<\/div>/);
    const audience = audienceBlock
      ? [...audienceBlock[1].matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1])
      : [];

    const contentBlock = body.match(/<div class="course-content">([\s\S]*?)<\/div>/);
    const curriculum = contentBlock
      ? [...contentBlock[1].matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1])
      : [];
    const contentHeading = text(contentBlock?.[1].match(/<h4>([^<]+)<\/h4>/)?.[1]) || '주요 교육 내용';

    const supportBlock = body.match(/<dl class="course-support">([\s\S]*?)<\/dl>/);
    const support = supportBlock
      ? [...supportBlock[1].matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)]
        .map((m) => ({ label: m[1], value: m[2] }))
      : [];

    const benefitBlock = body.match(/<div class="course-benefits">([\s\S]*?)<\/div>\s*<div class="course-actions"/);
    const benefits = benefitBlock
      ? [...benefitBlock[1].matchAll(/<small>([^<]+)<\/small><strong>([^<]+)<\/strong>/g)]
        .map((m) => ({ label: m[1], value: m[2] }))
      : [];

    const actionBlock = body.match(/<div class="course-actions">([\s\S]*?)<\/div>/);
    const links = actionBlock
      ? [...actionBlock[1].matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
        .map((m) => ({ href: m[1], label: text(m[2]) }))
        .filter((l, i, arr) => arr.findIndex((o) => o.href === l.href) === i)
      : [];

    return {
      id,
      slug: SLUGS[id] || id.replace(/^course-/, ''),
      step: text(body.match(/<div class="course-top"><span>([^<]+)<\/span>/)?.[1]),
      featured: /featured/.test(cls),
      name: title?.[1] ?? '',
      sub: title?.[2] ?? '',
      method: meta.find((m) => m[1] === '진행 방식')?.[2] ?? '',
      duration: meta.find((m) => m[1] === '기간')?.[2] ?? '',
      price: single?.[1] ?? null,
      priceNote: single?.[2] ?? '',
      optionPrices,
      goal: text(body.match(/<div class="course-goal"><small>[^<]*<\/small><strong>([^<]+)<\/strong>/)?.[1]),
      audience,
      contentHeading,
      curriculum,
      support,
      benefits,
      links,
    };
  }).filter((c) => c.name);
}

export { SLUGS };
