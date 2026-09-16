import { getStore } from "@netlify/blobs";

const SEAT_PREFIX = "seat:";
const STUDENT_PREFIX = "student:";
const OPEN_TIME_KEY = "open-time.json";
const ROSTER_KEY = "student-roster.json";
const SNAPSHOT_KEY = "seats-snapshot.json";
const SEAT_WRITE_RETRY = 8;
const SNAPSHOT_WRITE_RETRY = 3;

// 저장소는 기본(빠른/edge-cached) 상태로 두고, 정확성이 꼭 필요한
// 개별 읽기에만 그때그때 consistency:"strong" 옵션을 붙인다.
// (스토어 전체를 strong으로 두면 모든 요청이 느려진다.)
export function seatsStore() {
  return getStore("erain-seats");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
// 좌석: 한 좌석 = 하나의 독립된 Blob (seat:{seatId}) - 예약/취소의 "진짜 정답"
// 여기에 강한 일관성(strong)을 적용해서, 정확히 같은 좌석을 동시에
// 클릭했을 때만 충돌하고 자동 재시도로 안전하게 처리된다.
// ---------------------------------------------------------------------
export async function getSeat(seatId) {
  const store = seatsStore();
  return await store.get(SEAT_PREFIX + seatId, { type: "json", consistency: "strong" });
}

export async function setSeatForce(seatId, seatObj) {
  const store = seatsStore();
  await store.setJSON(SEAT_PREFIX + seatId, seatObj);
  await updateSnapshotSeat(seatObj);
}

/**
 * mutateFn(seat) -> { seat: 수정된 좌석객체, result: 반환할 결과 } 를 리턴해야 함.
 * result.__noChange 가 true 이면 저장 없이 바로 result 를 반환한다.
 * ETag 충돌(정확히 같은 좌석을 동시에 클릭) 시 짧은 대기 후 재시도한다.
 */
export async function updateSeatAtomic(seatId, mutateFn) {
  const store = seatsStore();
  const key = SEAT_PREFIX + seatId;

  for (let attempt = 0; attempt < SEAT_WRITE_RETRY; attempt++) {
    const entry = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    if (!entry || !entry.data) {
      return { success: false, msg: "존재하지 않는 좌석입니다." };
    }

    const { seat: nextSeat, result } = mutateFn(entry.data);

    if (!result || result.__noChange) {
      if (result) delete result.__noChange;
      return result;
    }

    const writeRes = await store.setJSON(key, nextSeat, { onlyIfMatch: entry.etag });
    if (!writeRes || writeRes.modified) {
      await updateSnapshotSeat(nextSeat);
      return result;
    }
    // 정확히 같은 좌석에 동시 요청이 들어온 경우 -> 잠깐 대기 후 재시도
    await sleep(25 + Math.random() * 60);
  }

  return { success: false, msg: "이 좌석에 신청이 몰리고 있어요. 잠시 후 다시 시도해주세요." };
}

// ---------------------------------------------------------------------
// 좌석 전체 목록 읽기용 "빠른 캐시본(snapshot)"
// - 학생/관리자 화면에 좌석 배치도를 그릴 때는 좌석 196개를 하나씩
//   읽지 않고, 이 캐시본 하나만 읽어서 빠르게 응답한다.
// - 실제 예약/취소의 정답은 항상 위의 seat:{seatId} 개별 Blob이고,
//   이 캐시본은 "보여주기용"이라 아주 짧은 시간(보통 수백 ms 이내)
//   지연될 수 있지만, 예약 시도 자체는 항상 원본 좌석 데이터로
//   재검증되므로 중복예약 등 실제 오류로 이어지지 않는다.
// ---------------------------------------------------------------------
async function updateSnapshotSeat(seatObj) {
  const store = seatsStore();
  try {
    for (let attempt = 0; attempt < SNAPSHOT_WRITE_RETRY; attempt++) {
      const entry = await store.getWithMetadata(SNAPSHOT_KEY, { type: "json", consistency: "strong" });
      const seats = (entry && entry.data) || [];
      const idx = seats.findIndex((s) => s.seatId === seatObj.seatId);
      if (idx === -1) seats.push(seatObj);
      else seats[idx] = seatObj;

      const writeOpts = entry && entry.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true };
      const writeRes = await store.setJSON(SNAPSHOT_KEY, seats, writeOpts);
      if (!writeRes || writeRes.modified) return;
    }
  } catch (e) {
    // 캐시본 갱신은 최선의 노력(best-effort)일 뿐, 실패해도 예약 자체엔 지장 없음
  }
}

export async function getAllSeats() {
  const store = seatsStore();
  const data = await store.get(SNAPSHOT_KEY, { type: "json", consistency: "strong" });
  return data || [];
}

// ---------------------------------------------------------------------
// 학번당 1좌석 제한: student:{studentId} -> seatId
// onlyIfNew 조건부 쓰기로 "동시에 두 번 예약 시도"를 원천 차단한다.
// ---------------------------------------------------------------------
export async function claimStudentSeat(studentId, seatId) {
  const store = seatsStore();
  const res = await store.set(STUDENT_PREFIX + studentId, seatId, { onlyIfNew: true });
  return !!(res && res.modified);
}

export async function releaseStudentClaim(studentId) {
  const store = seatsStore();
  try {
    await store.delete(STUDENT_PREFIX + studentId);
  } catch (e) {
    // 이미 없는 경우 등은 무시
  }
}

export async function getStudentSeatId(studentId) {
  const store = seatsStore();
  const val = await store.get(STUDENT_PREFIX + studentId, { consistency: "strong" });
  return val || "";
}

// 관리자 수동 배정용: 무조건 덮어쓰기
export async function setStudentClaim(studentId, seatId) {
  const store = seatsStore();
  await store.set(STUDENT_PREFIX + studentId, seatId);
}

// ---------------------------------------------------------------------
// 전체 초기화: 기존 seat/student 데이터를 모두 지우고 좌석을 새로 생성
// ---------------------------------------------------------------------
export async function resetAllSeats() {
  const store = seatsStore();

  const [seatList, studentList] = await Promise.all([
    store.list({ prefix: SEAT_PREFIX }),
    store.list({ prefix: STUDENT_PREFIX }),
  ]);

  const seatKeys = ((seatList && seatList.blobs) || []).map((b) => b.key);
  const studentKeys = ((studentList && studentList.blobs) || []).map((b) => b.key);

  await Promise.all([...seatKeys, ...studentKeys].map((k) => store.delete(k)));

  const seats = generateSeats();
  await Promise.all(seats.map((s) => store.setJSON(SEAT_PREFIX + s.seatId, s)));
  await store.setJSON(SNAPSHOT_KEY, seats);

  return seats.length;
}

// ---------------------------------------------------------------------
// 신청 시작 시간 (작은 값 하나라 강한 일관성으로 읽어도 느려지지 않음.
// 선착순 공정성을 위해 항상 최신 값을 즉시 읽어야 한다.)
// ---------------------------------------------------------------------
export async function getOpenTime() {
  const store = seatsStore();
  const data = await store.get(OPEN_TIME_KEY, { type: "json", consistency: "strong" });
  return (data && data.openTime) || "";
}

export async function setOpenTime(openTime) {
  const store = seatsStore();
  await store.setJSON(OPEN_TIME_KEY, { openTime: openTime || "" });
}

// ---------------------------------------------------------------------
// 반별 전체 인원수 (관리자가 입력) - 신청완료/미신청 통계 계산용
// ---------------------------------------------------------------------
export async function getClassRoster() {
  const store = seatsStore();
  const data = await store.get(CLASS_ROSTER_KEY, { type: "json", consistency: "strong" });
  return (data && data.counts) || {};
}

export async function setClassRoster(counts) {
  const store = seatsStore();
  await store.setJSON(CLASS_ROSTER_KEY, { counts });
}

// ---------------------------------------------------------------------
// 관리자 인증
// ---------------------------------------------------------------------
export function isAdminAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
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

// ---------------------------------------------------------------------
// 전체 학생 명단 (학번+이름) - 미신청자 대조용
// ---------------------------------------------------------------------
export async function getStudentRoster() {
  const store = seatsStore();
  const data = await store.get(ROSTER_KEY, { type: "json", consistency: "strong" });
  return (data && data.roster) || [];
}

export async function setStudentRoster(roster) {
  const store = seatsStore();
  await store.setJSON(ROSTER_KEY, { roster });
}

// 지금까지 예약을 완료(선점)한 학번 목록 (student:{id} 키 기준 = 가장 정확한 원본)
export async function getBookedStudentIds() {
  const store = seatsStore();
  const listRes = await store.list({ prefix: STUDENT_PREFIX });
  const blobs = (listRes && listRes.blobs) || [];
  return blobs.map((b) => b.key.slice(STUDENT_PREFIX.length));
}
