서비스 계정 키(JSON)를 로컬에 저장한 뒤, 아래 환경변수로 경로를 지정해 업로드 스크립트를 실행합니다.

PowerShell 예시:

$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\path\to\serviceAccount.json"

npm run upload:naver:weekday:tabs -- --date 2026-02-08

- date를 생략하면 오늘 날짜(YYYY-MM-DD)로 업로드합니다.
- input을 지정하려면:
  npm run upload:naver:weekday:tabs -- --input .\data\naver-weekday-tabs-2026-02-08.json --date 2026-02-08
