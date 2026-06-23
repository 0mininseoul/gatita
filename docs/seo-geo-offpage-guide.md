# 같이타 SEO/GEO — 오프페이지 실행 가이드

코드(온페이지) 작업은 이 브랜치에 모두 반영되었습니다. 아래는 **코드만으로는 끝나지 않는, 사람이 직접 해야 효과가 나는 작업**입니다. 특히 1·2번은 "구글에 같이타 검색 시 노출"의 핵심입니다.

> 현재 상태(2026-06-23 측정): `site:gatita.kro.kr` 구글 색인 결과 **0건**. 즉 아직 색인 자체가 안 된 상태라, 아래 색인 요청이 가장 시급합니다.

---

## 0. 먼저: 이 브랜치를 배포

새 콘텐츠(`/about`, `/faq`, JSON-LD, llms.txt, 강화된 메타)가 라이브(`https://gatita.kro.kr`)에 반영돼야 구글·네이버가 크롤링합니다.

- 이 브랜치(`worktree-seo-geo`)를 PR → main 머지 → 프로덕션 배포(Vercel)
- 배포 후 확인:
  - `https://gatita.kro.kr/about`, `/faq` 정상 표시
  - `https://gatita.kro.kr/llms.txt`, `/robots.txt`, `/sitemap.xml` 정상
  - 홈 소스 보기에 `<h1>`과 `<script type="application/ld+json">` 존재

---

## 1. Google Search Console (가장 중요)

도메인 소유 인증 파일(`public/google*.html`)이 이미 있어 인증은 되어 있을 가능성이 큽니다. https://search.google.com/search-console

1. **사이트맵 제출**: 색인 생성 → Sitemaps → `sitemap.xml` 제출
2. **URL 검사 + 색인 요청**: 상단 검사창에 아래 URL을 하나씩 넣고 "색인 생성 요청"
   - `https://gatita.kro.kr/`
   - `https://gatita.kro.kr/about`
   - `https://gatita.kro.kr/faq`
3. 1~2주 뒤 `site:gatita.kro.kr`로 색인 여부 재확인
4. 실적 보고서에서 "같이타", "가천대 택시", "가천대 같이타" 노출/클릭 추적

## 2. Naver 서치어드바이저 (가천대 학생 다수가 네이버 사용)

https://searchadvisor.naver.com

1. 사이트 등록: `https://gatita.kro.kr`
2. 소유확인: **HTML 태그(메타)** 방식 권장 → 받은 `naver-site-verification` 값을
   `app/layout.tsx`의 `metadata.verification.other['naver-site-verification']`에 넣고 재배포
   (또는 HTML 파일 방식: 받은 파일을 `public/`에 두고 재배포)
3. 요청 → 사이트맵 제출: `https://gatita.kro.kr/sitemap.xml`
4. 요청 → 웹페이지 수집 요청: 위 3개 URL
5. 네이버 robots는 `Yeti` 봇 허용으로 이미 설정됨

> 빙(Bing) 노출도 원하면 https://www.bing.com/webmasters 에 동일하게 사이트맵 제출.

## 3. 백링크 / 초기 트래픽 (권위 부족분 보완)

`kro.kr` 무료 도메인은 권위가 낮아, 실제 학생 유입·외부 링크가 랭킹을 크게 좌우합니다.

- 에브리타임(가천대) 글/댓글, 가천대 학생 오픈채팅·디스코드에 링크 공유
- 인스타그램 계정 프로필 링크에 `gatita.kro.kr` 고정
- 가천대 커뮤니티/카페 글에 자연스럽게 소개
- 가능하면 학교 동아리/학과 페이지에서 링크 확보

## 4. (선택) 커스텀 도메인

`gatita.kro.kr`(무료 DNS) 대신 `.com`/`.kr` 등 자체 도메인을 쓰면 신뢰도·브랜드 검색에 유리합니다. 변경 시 301 리다이렉트로 기존 평가를 이전하세요.

---

## 기대치 (솔직한 전망)

- **색인**: 배포 + 색인 요청 후 보통 며칠~2주
- **"가천대 같이타 / 가천대 택시 동승" 등 의도 검색어**: 경쟁이 약해, 색인되면 상위~1위 현실적
- **순수 "같이타" 단어**: '가타(GATA)' 브랜드, 스페인어 'Gatita' 등과 경쟁 → 브랜드 인지도·트래픽·백링크가 쌓이며 점진적으로 상승. 코드만으로 즉시 1위 보장은 불가.
- **GEO(AI 답변 인용)**: llms.txt + 구조화 데이터 + FAQ로 ChatGPT/Perplexity 등이 "가천대 택시 동승" 류 질문에 인용할 가능성 상승. 반영까지 수 주 소요.
