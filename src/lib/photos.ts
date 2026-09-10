// Wikimedia Commons(CC 라이선스) 선수 사진 조회.
// 영문명으로 파일 검색 → 썸네일 URL + 원본 페이지(출처 표기용) 반환.
export interface PhotoInfo {
  src: string;
  page: string;
}

const API = "https://commons.wikimedia.org/w/api.php";

export async function searchPhoto(enName: string): Promise<PhotoInfo | null> {
  const q = enName.trim();
  if (!q) return null;
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
  const res = await fetch(`${API}?${params}`);
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

export function commonsSearchUrl(enName: string): string {
  return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(enName)}&title=Special:MediaSearch&type=image`;
}
