# Onepick

Onepick은 웹툰 및 소설 콘텐츠를 수집·정리하고, 사용자들이 추천, 댓글, 찜 기능을 통해 작품을 큐레이션할 수 있는 커뮤니티형 콘텐츠 플랫폼입니다.

Next.js 기반 웹앱 + 크롤러(Puppeteer)로 외부(네이버웹툰) 랭킹 데이터를 수집해 Firestore에 적재하고, 홈/상세/찜/댓글 화면으로 보여주는 프로젝트입니다.

## Links

- Web: https://onepickwebtoon.netlify.app/

## Goals

- 웹툰/소설 콘텐츠 수집 및 정리
- 추천/댓글/찜 기반 커뮤니티 큐레이션

## Key Features

- 네이버 웹툰 요일별 최신 작품, 평점, 썸네일, 작가명 수집
- Firestore 연동으로 실시간 작품 정보 제공 (홈, 상세, 찜, 댓글)
- Firebase Auth 기반 Google 로그인

## Current Status

- 실데이터 업로드 완료 → 홈/상세 페이지 반영
- Firestore 인덱스 오류 일부 존재 (수동 생성 중)
- 일부 썸네일/제목 누락 → 크롤링 로직 개선 중

## Next Tasks

### 데이터 활용

- 홈화면 실데이터 출력/요일별 탭 구성
- 상세페이지 회차 정보, 평균 평점 노출
- 최근 5화 평균 평점 vs 전체 평균 평점 구분

### 사용자 기능 확장

- 찜하기 기능 구현 (`favorites/{uid}/items`)
- 댓글 기능 구현 (작성/조회, Firestore rules 적용)
- 추천 랭킹 구현 (Firestore 랭킹 컬렉션 기반)

### 크롤링 고도화

- 회차별 페이지 수집 → 평점 평균 계산
- 관심 수 기반 정렬/랭킹 구현
- 요일 탭 간 중복 제거 로직
- 크롤링 + 업로드 통합 자동화 스크립트 (Node CLI)

### 커뮤니티 기능 기획

- 자유 게시판/감상 공유 게시판
- 게시글 추천/신고 기능
- 활동 기반 포인트 시스템
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
