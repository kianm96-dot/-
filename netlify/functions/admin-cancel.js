import { updateSeatsAtomic, isAdminAuthorized, jsonResponse } from "../lib/store.mjs";

export default async (req) => {
  if (!isAdminAuthorized(req)) {
    return jsonResponse({ success: false, msg: "관리자 인증이 필요합니다." }, 401);
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 400);
  }

  const seatId = String(body.seatId || "").trim();
  if (!seatId) {
    return jsonResponse({ success: false, msg: "좌석번호를 입력해주세요." }, 400);
  }

  const result = await updateSeatsAtomic((seats) => {
    const idx = seats.findIndex((s) => s.seatId === seatId);
    if (idx === -1) {
      return { seats, result: { success: false, msg: "좌석을 찾을 수 없습니다.", __noChange: true } };
    }
    const nextSeats = seats.slice();
    nextSeats[idx] = { ...seats[idx], status: "", studentId: "", studentName: "" };
    return { seats: nextSeats, result: { success: true, msg: seatId + " 예약 삭제 완료!" } };
  });

  return jsonResponse(result);
};
