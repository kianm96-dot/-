import {
  getSeat,
  setSeatForce,
  releaseStudentClaim,
  isAdminAuthorized,
  jsonResponse,
} from "../lib/store.mjs";

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

  const seat = await getSeat(seatId);
  if (!seat) {
    return jsonResponse({ success: false, msg: "좌석을 찾을 수 없습니다." });
  }

  if (seat.studentId) {
    await releaseStudentClaim(seat.studentId);
  }
  await setSeatForce(seatId, { ...seat, status: "", studentId: "", studentName: "" });

  return jsonResponse({ success: true, msg: seatId + " 예약 삭제 완료!" });
};
