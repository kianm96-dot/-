import { getStore } from "@netlify/blobs";

const SEATS_KEY = "seats.json";
const OPEN_TIME_KEY = "open-time.json";
const MAX_RETRY = 5;

export function seatsStore() {
  return getStore("erain-seats");
}

// ---------------------------------------------------------------------
// 좌석 DB 생성 (기존 Apps Script setupSeats()와 동일한 규칙)
// ---------------------------------------------------------------------
export function generateSeats() {
  const seats = [];

  // 2호차 (50석) - 1반(1~27번), 2반(28~50번)
  for (let i = 1; i <= 50; i++) {
    const cls = i <= 27 ? 1 : 2;
    seats.push(makeSeat("2호차-" + i, 2, cls));
  }

  // 3호차 - 2반(1~4번), 3반(5~24, 27~33번), 4반(34~44번), 무대/휠체어석(0)
  for (let i = 1; i <= 46; i++) {
    let cls = 0;
    if (i >= 1 && i <= 4) cls = 2;
    else if ((i >= 5 && i <= 24) || (i >= 27 && i <= 33)) cls = 3;
    else if (i >= 34 && i <= 44) cls = 4;
    seats.push(makeSeat("3호차-" + i, 3, cls));
  }

  // 4호차 (50석) - 4반(1~16번), 5반(17~44번), 6반(45~50번)
  for (let i = 1; i <= 50; i++) {
    let cls = 6;
    if (i >= 1 && i <= 16) cls = 4;
    else if (i >= 17 && i <= 44) cls = 5;
    seats.push(makeSeat("4호차-" + i, 4, cls));
  }

  // 7호차 (50석) - 6반(1~22번), 7반(23~50번)
  for (let i = 1; i <= 50; i++) {
    const cls = i >= 1 && i <= 22 ? 6 : 7;
    seats.push(makeSeat("7호차-" + i, 7, cls));
  }

  return seats;
}

function makeSeat(seatId, car, cls) {
  return {
    seatId,
    car,
    assignedClass: cls,
    status: "",
    studentId: "",
    studentName: "",
  };
}

// ---------------------------------------------------------------------
// 좌석 데이터 읽기 / 쓰기 (ETag 기반 낙관적 락으로 동시성 처리)
// ---------------------------------------------------------------------
export async function getSeatsWithMeta() {
  const store = seatsStore();
  const entry = await store.getWithMetadata(SEATS_KEY, { type: "json" });
  if (!entry || !entry.data) {
    return { seats: null, etag: null };
  }
  return { seats: entry.data, etag: entry.etag };
}

export async function getSeats() {
  const { seats } = await getSeatsWithMeta();
  return seats || [];
}

export async function setSeatsInitial(seats) {
  const store = seatsStore();
  await store.setJSON(SEATS_KEY, seats);
}

/**
 * mutateFn(seats) -> { seats: 수정된 배열, result: 반환할 결과 } 를 리턴해야 함.
 * ETag 충돌 시 최대 MAX_RETRY 회 재시도한다 (동시 예약 경합 처리).
 */
export async function updateSeatsAtomic(mutateFn) {
  const store = seatsStore();
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const entry = await store.getWithMetadata(SEATS_KEY, { type: "json" });
    const seats = (entry && entry.data) || [];
    const etag = entry ? entry.etag : null;

    const { seats: nextSeats, result } = mutateFn(seats);

    if (!result || result.__noChange) {
      if (result) delete result.__noChange;
      return result;
    }

    const writeOpts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const writeRes = await store.setJSON(SEATS_KEY, nextSeats, writeOpts);

    if (writeRes.modified) {
      return result;
    }
    // etag가 바뀌었으면(다른 요청이 먼저 씀) 재시도
  }
  return { success: false, msg: "접속자가 많아 처리가 지연되었습니다. 다시 시도해주세요." };
}

// ---------------------------------------------------------------------
// 신청 시작 시간
// ---------------------------------------------------------------------
export async function getOpenTime() {
  const store = seatsStore();
  const data = await store.get(OPEN_TIME_KEY, { type: "json" });
  return (data && data.openTime) || "";
}

export async function setOpenTime(openTime) {
  const store = seatsStore();
  await store.setJSON(OPEN_TIME_KEY, { openTime: openTime || "" });
}

// ---------------------------------------------------------------------
// 관리자 인증
// ---------------------------------------------------------------------
export function isAdminAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    // 환경변수 미설정 시 안전을 위해 항상 거부
    return false;
  }
  const provided =
    req.headers.get("x-admin-password") ||
    new URL(req.url).searchParams.get("password");
  return provided === expected;
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
