# E-트레인 좌석 선착순 예약 (Netlify 버전)

기존 Google Apps Script(코드.gs + Index.html)로 만들어졌던 좌석 예약 시스템을
Netlify에 배포할 수 있는 형태(정적 페이지 + Netlify Functions)로 그대로 이식한 버전입니다.

- 데이터 저장소: 별도 DB 설정 없이 Netlify에 내장된 **Netlify Blobs**를 사용합니다.
- 동시 예약 충돌(여러 명이 동시에 같은 좌석 클릭) 방지를 위해 ETag 기반 낙관적 락을 사용합니다.

## 폴더 구조

```
public/                학생/관리자 페이지 (정적 파일)
  index.html            학생용 좌석 예약 페이지
  admin.html             관리자 현황판
  shared/car-layouts.js  호차별 좌석 배치 정의 (두 페이지 공용)
netlify/
  functions/            API (Netlify Functions)
  lib/store.mjs          좌석 데이터 로직 + Netlify Blobs 저장소 공용 모듈
netlify.toml            빌드/리다이렉트 설정 (/api/* -> 함수)
```

## 배포 방법

1. 이 폴더를 그대로 GitHub 저장소에 올리거나, Netlify CLI로 배포합니다.
   - GitHub 연동 배포: 저장소를 Netlify에 새 사이트로 연결하면 `netlify.toml` 설정을
     그대로 인식합니다. 빌드 명령은 없어도 됩니다(정적 파일 + 함수만 배포).
   - CLI 배포: `npm install` 후 `netlify deploy --prod`

2. **관리자 비밀번호 환경변수 설정 (필수)**
   Netlify 사이트 설정 → Site configuration → Environment variables 에서
   `ADMIN_PASSWORD` 값을 원하는 비밀번호로 등록하세요.
   이 값이 설정되어 있지 않으면 관리자 기능(현황판, 배정, 삭제, 시간설정, DB초기화)은
   보안을 위해 항상 거부됩니다.

3. 배포 후 접속 주소
   - 학생 페이지: `https://내사이트주소/`
   - 관리자 페이지: `https://내사이트주소/admin` (또는 `/admin.html`)

## 최초 사용 순서

1. 관리자 페이지(`/admin`)에 접속해 `ADMIN_PASSWORD`로 로그인합니다.
2. 상단의 **"⚠ 좌석 DB 초기화/재생성"** 버튼을 한 번 눌러 전체 좌석 데이터를 생성합니다.
   (기존 Apps Script의 `setupSeats()`와 동일한 규칙으로 2·3·4·7호차 좌석을 생성합니다.)
   - ⚠ 이미 예약이 진행된 이후에 다시 누르면 모든 예약 정보가 초기화되니 주의하세요.
3. 필요하다면 "선착순 신청 시작 시간"을 설정합니다. 비워두면 즉시 신청이 가능합니다.
4. 학생들에게 학생 페이지 주소를 안내합니다.

## 학생 기능

- 자기 반 좌석을 클릭해 선착순으로 예약합니다.
- **예약한 좌석은 노란 테두리로 표시**되고, 상단에 "내 예약 좌석: OO호차-OO / 예약 취소" 버튼이 나타납니다.
- 학생이 직접 그 좌석을 다시 클릭하거나 "예약 취소" 버튼을 누르면 본인 예약을 취소할 수 있고,
  취소 후에는 다시 다른 좌석을 선택할 수 있습니다.

## 관리자 페이지 기능

- 학생 페이지와 동일한 기차 배치도 레이아웃을 사용합니다.
- 각 좌석 칸 아래에 예약자의 **학번/이름**이 표시됩니다(빈 좌석은 "빈좌석" 표시).
- 좌석을 클릭하면 모달 창에서
  - 학번/이름을 입력해 **수동 배정**(신규 배정 또는 기존 예약자 정보 수정)
  - **예약 삭제**(이미 예약된 좌석)
  를 할 수 있습니다.
- 상단 패널에서 **신청 시작 시간**을 설정/해제할 수 있고, 전체 좌석 수 / 예약 완료 수를
  실시간으로 확인할 수 있습니다.

## API 목록 (Netlify Functions, `/api/*`)

| 경로 | 메서드 | 설명 | 인증 |
|---|---|---|---|
| `/api/seat-data?studentId=` | GET | 학생용 좌석 현황 조회 (본인 예약 좌석 포함) | 없음 |
| `/api/book-seat` | POST | 좌석 예약 (`studentId`, `name`, `seatId`) | 없음 |
| `/api/cancel-own-seat` | POST | 학생 본인 예약 취소 (`studentId`, `seatId`) | 없음(본인 학번 일치 확인) |
| `/api/admin-data` | GET | 관리자용 전체 좌석 현황(학번/이름 포함) | 관리자 |
| `/api/admin-assign` | POST | 수동 배정 (`seatId`, `studentId`, `studentName`) | 관리자 |
| `/api/admin-cancel` | POST | 예약 삭제 (`seatId`) | 관리자 |
| `/api/open-time` | GET/POST | 신청 시작 시간 조회/설정 (`openTime`) | POST만 관리자 |
| `/api/init-seats` | POST | 좌석 DB 초기화/재생성 | 관리자 |

관리자 인증은 요청 헤더 `x-admin-password` 값이 `ADMIN_PASSWORD` 환경변수와 일치해야 통과됩니다.
(관리자 페이지는 로그인 시 입력한 비밀번호를 브라우저 세션에만 저장해 매 요청에 자동으로 실어 보냅니다.)

## 로컬 개발

```bash
npm install
netlify link   # 또는 netlify dev 실행 시 로그인 안내를 따라가세요
netlify env:set ADMIN_PASSWORD "원하는비밀번호"
netlify dev
```

`netlify dev`로 실행하면 Netlify Blobs도 로컬 사본으로 자동 동작합니다.

## 기존 Apps Script와 달라진 점

- Google Sheets → Netlify Blobs (키-값 저장소)로 저장소만 교체했고, 좌석 생성 규칙 /
  예약 검증 로직(본인 반 좌석만 예약 가능, 중복 예약 방지, 무대·휠체어석 예약 불가,
  선착순 시간 제한 등)은 그대로 유지했습니다.
- Apps Script의 `LockService`(전역 락) 대신 Netlify Blobs의 ETag 조건부 쓰기로
  동시 예약 충돌을 방지합니다.
- 관리자 페이지는 비밀번호 기반 인증을 추가했습니다(기존에는 배포 URL 파라미터로만 구분).
