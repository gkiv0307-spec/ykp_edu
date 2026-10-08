export const BLOG_IDS = ['rhghwjd2', 'ykphone_edu', 'rhghwjd369'];

export const REGION_GROUPS = [
  { label: '대구/경북권', provinces: ['대구', '경북'] },
  { label: '부산/경남권', provinces: ['부산', '울산', '경남'] },
  { label: '호남/충청권', provinces: ['광주', '전북', '전남', '대전', '세종', '충북', '충남'] },
  { label: '서울/수도권', provinces: ['서울', '경기', '인천'] },
  { label: '강원/제주도', provinces: ['강원', '제주'] },
];

export function regionGroup(sido) {
  return REGION_GROUPS.find((group) => group.provinces.includes(sido))?.label || '기타';
}
