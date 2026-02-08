# Onepick

Onepick은 다양한 웹툰 플랫폼의 데이터를 모아서 보여주고, 유저가 찜/댓글/추천 등 상호작용을 통해 작품을 평가하고 소통하는 커뮤니티 기반 웹툰 랭킹 플랫폼입니다.

Next.js 기반 웹앱 + 크롤러(Puppeteer)로 외부(네이버웹툰) 랭킹 데이터를 수집해 Firestore에 적재하고, 홈/상세/찜/댓글 화면으로 보여주는 프로젝트.

## Tech

- Next.js (App Router)
- TailwindCSS
- Firebase Auth
- Firestore
- Puppeteer (crawler)

## Project Structure

- `src/`
  - Next.js web app
- `crawler/`
  - 네이버웹툰 요일 탭 크롤러 + Firestore 업로드 스크립트(firebase-admin)

## Setup (Web)

1) 의존성 설치

```bash
npm install
```

2) `.env.local` 설정

아래 환경변수들이 필요함 (Firebase Web App config).

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

3) 실행

```bash
npm run dev
```

## Setup (Crawler)

1) 크롤러 의존성 설치

```bash
cd crawler
npm install
```

2) 네이버웹툰 요일 탭 크롤링

```bash
npm run crawl:naver:weekday:tabs
```

3) Firestore 업로드 (firebase-admin)

서비스 계정 JSON 파일 경로를 환경변수로 설정.

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=path/to/service-account.json
```

업로드 실행:

```bash
npm run upload:naver:weekday:tabs -- --date YYYY-MM-DD
```

## Firestore Data Model (current)

- `externalRankings/naver/snapshots/{date}`
- `externalRankings/naver/snapshots/{date}/items/{weekday}_{titleId}`
- `works/naver_{titleId}`
- `favorites/{uid}/items/naver_{titleId}`
- `comments/naver_{titleId}/items/{commentId}`

## Work Log

- 2026-02-08
  - 네이버웹툰 요일 탭(mon..sun, dailyPlus, finish) 크롤러 구현
  - 평점/썸네일 추출 보강 (DOM fallback + 상세 og:image로 thumbnail 보정)
  - firebase-admin 업로드 스크립트 구현
    - `externalRankings/naver/snapshots/{date}/items/*` 적재
    - `works/naver_{id}` upsert
  - Next.js 앱
    - 홈에서 Firestore 최신 스냅샷 로딩 + 카드 렌더
    - `/works/[id]` 상세: 작품 로드 + 찜 + 댓글(기초)
    - `/me/favorites` 찜 목록
    - `/work/[id]` -> `/works/[id]` 리다이렉트
