// 선수 사진 조회.
// 1) 입력 그대로 Commons 검색 (한글도 파일 설명·분류에 걸려서 됨)
// 2) 실패 + 한글 포함이면 토큰 정리 후 재시도 ('26·이니셜 제거)
// 3) 그래도 실패면 Wikidata에서 영어 라벨 조회 후 Commons 재검색
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

async function commonsSearch(q: string): Promise<PhotoInfo | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    formatversion: "2",
    generator: "search",
    gsrsearch: `filetype:bitmap ${q}`,
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
  for (const p of pages) {
    if (p?.thumbnail?.source && p?.fullurl) {
      return { src: p.thumbnail.source as string, page: p.fullurl as string };
    }
  }
  return null;
}

async function englishName(ko: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: ko,
    language: "ko",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${WIKIDATA}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const list = data?.search;
  if (!Array.isArray(list)) return null;
  for (const e of list.slice(0, 8)) {
    const desc = String(e?.description || "").toLowerCase();
    if (!/baseball|ballplayer/.test(desc)) continue;
    const id = e?.id;
    if (!id) continue;
    const p2 = new URLSearchParams({
      action: "wbgetentities",
      ids: id,
      props: "labels",
      languages: "en",
      format: "json",
      origin: "*",
    });
    try {
      const r2 = await fetch(`${WIKIDATA}?${p2}`);
      if (!r2.ok) continue;
      const d2 = await r2.json();
      const label = d2?.entities?.[id]?.labels?.en?.value;
      if (typeof label === "string" && label) return label;
    } catch {
      continue;
    }
  }
  return null;
}

export async function searchPhoto(raw: string): Promise<PhotoInfo | null> {
  const q = raw.trim();
  if (!q) return null;
  const direct = await commonsSearch(q).catch(() => null);
  if (direct) return direct;
  const c = cleaned(q);
  if (c !== q) {
    const second = await commonsSearch(c).catch(() => null);
    if (second) return second;
  }
  if (/[가-힣]/.test(q)) {
    for (const cand of [c, q]) {
      const en = await englishName(cand).catch(() => null);
      if (typeof en === "string" && en) {
        const third = await commonsSearch(en).catch(() => null);
        if (third) return { ...third, resolvedEn: en };
      }
    }
  }
  return null;
}

export function commonsSearchUrl(enName: string): string {
  return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(enName)}&title=Special:MediaSearch&type=image`;
}
