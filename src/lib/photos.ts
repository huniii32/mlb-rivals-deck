// 선수 사진 조회. 야구선수 초상화에 한정:
// 1) Wikidata에서 해당 선수 엔티티를 찾아 초상화(P18) 직접 사용 — 동명이인·구장·로고 오탐 방지
// 2) P18이 없으면 Commons 검색에 baseball 가중 + 로고/구장 파일명 제외
// 3) 그래도 실패면 기존 방식(일반 Commons 검색)으로 폴백
// 영문명 비어있으면 선수명(한글)으로 자동 검색.
export interface PhotoInfo {
  src: string;
  page: string;
  resolvedEn?: string;
}

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";

export function effectiveQuery(enName: string, name: string): string {
  return enName.trim() || name.trim();
}

function cleaned(q: string): string {
  const tokens = q.match(/[가-힣]+|[A-Za-z]{2,}/g) || [];
  const joined = tokens.join(" ").trim();
  return joined || q.trim();
}

async function commonsSearch(q: string, baseballOnly = false): Promise<PhotoInfo | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    formatversion: "2",
    generator: "search",
    gsrsearch: baseballOnly ? `filetype:bitmap ${q} baseball` : `filetype:bitmap ${q}`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "pageimages|info",
    piprop: "thumbnail",
    pithumbsize: "300",
    inprop: "url",
  });
  const res = await fetch(`${COMMONS}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!Array.isArray(pages)) return null;
  // 로고·구장·관중 등 초상화 아닌 파일은 뒤로 (전부 해당이면 첫 결과라도 씀)
  const NON_PORTRAIT = /logo|stadium|ballpark|scoreboard|crowd|ticket|program|trophy|parade/i;
  const cands = pages.filter((p) => p?.thumbnail?.source && p?.fullurl);
  const pick =
    cands.find((p) => !NON_PORTRAIT.test(String(p?.title || ""))) ?? cands[0];
  if (!pick) return null;
  return { src: pick.thumbnail.source as string, page: pick.fullurl as string };
}

interface WbCandidate {
  id: string;
  desc: string;
}

async function wbSearch(q: string, lang: "ko" | "en"): Promise<WbCandidate[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: q,
    language: lang,
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${WIKIDATA}?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.search;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map((e) => ({
    id: String(e?.id || ""),
    desc: String(e?.description || ""),
  })).filter((e) => e.id);
}

interface WbDetail {
  enLabel: string;
  portrait: string;
}

async function wbDetail(id: string): Promise<WbDetail | null> {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: id,
    props: "labels|claims",
    languages: "en",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${WIKIDATA}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const ent = data?.entities?.[id];
  if (!ent) return null;
  const enLabel = ent?.labels?.en?.value;
  const portrait = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return {
    enLabel: typeof enLabel === "string" ? enLabel : "",
    portrait: typeof portrait === "string" ? portrait : "",
  };
}

/** Wikidata 초상화(P18): 야구선수 엔티티의 공식 초상화라 오탐이 없음 */
async function wikidataPortrait(raw: string): Promise<PhotoInfo | null> {
  const q = raw.trim();
  if (!q) return null;
  const isKo = /[가-힣]/.test(q);
  const tries: { text: string; lang: "ko" | "en" }[] = isKo
    ? [{ text: cleaned(q), lang: "ko" }, { text: q, lang: "ko" }]
    : [{ text: q, lang: "en" }];
  for (const t of tries) {
    if (!t.text) continue;
    let list: WbCandidate[];
    try {
      list = await wbSearch(t.text, t.lang);
    } catch {
      continue;
    }
    for (const e of list) {
      // 한국어 설명("야구 선수")·영어 설명(baseball) 모두 허용
      if (!/야구|baseball|ballplayer/i.test(e.desc)) continue;
      let det: WbDetail | null;
      try {
        det = await wbDetail(e.id);
      } catch {
        continue;
      }
      if (!det) continue;
      if (det.portrait) {
        const file = det.portrait.replace(/ /g, "_");
        return {
          src: `https://commons.wikimedia.org/w/index.php?title=Special:FilePath&file=${encodeURIComponent(det.portrait)}&width=300`,
          page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
          resolvedEn: det.enLabel || undefined,
        };
      }
      // P18은 없지만 선수 엔티티 확정 → 영어명으로 baseball 한정 검색
      if (det.enLabel) {
        const fb = await commonsSearch(det.enLabel, true).catch(() => null);
        if (fb) return { ...fb, resolvedEn: det.enLabel };
      }
    }
  }
  return null;
}

export async function searchPhoto(raw: string): Promise<PhotoInfo | null> {
  const q = raw.trim();
  if (!q) return null;
  // 1) Wikidata 초상화 (야구선수 확정 + 공식 사진)
  const portrait = await wikidataPortrait(q).catch(() => null);
  if (portrait) return portrait;
  // 2) Commons baseball 한정 검색
  const biased = await commonsSearch(q, true).catch(() => null);
  if (biased) return biased;
  const c = cleaned(q);
  if (c !== q) {
    const second = await commonsSearch(c, true).catch(() => null);
    if (second) return second;
  }
  // 3) 최후 폴백: 일반 검색
  const plain = await commonsSearch(q).catch(() => null);
  if (plain) return plain;
  return null;
}

export function commonsSearchUrl(enName: string): string {
  return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(enName)}&title=Special:MediaSearch&type=image`;
}
