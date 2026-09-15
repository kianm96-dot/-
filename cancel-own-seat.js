import {
  getStudentSeatId,
  releaseStudentClaim,
  updateSeatAtomic,
  jsonResponse,
} from "../lib/store.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 400);
  }

  const studentId = String(body.studentId || "").trim();
  const seatId = String(body.seatId || "").trim();

  if (!/^\d{5}$/.test(studentId) || !seatId) {
    return jsonResponse({ success: false, msg: "입력값을 확인해주세요." }, 400);
  }

  const myCurrentSeatId = await getStudentSeatId(studentId);
  if (myCurrentSeatId !== seatId) {
    return jsonResponse({ success: false, msg: "본인이 예약한 좌석만 취소할 수 있습니다." });
  }

  const result = await updateSeatAtomic(seatId, (seat) => {
    if (seat.status !== "예약완료" || seat.studentId !== studentId) {
      return { seat, result: { success: false, msg: "본인이 예약한 좌석만 취소할 수 있습니다.", __noChange: true } };
    }
    const nextSeat = { ...seat, status: "", studentId: "", studentName: "" };
    return { seat: nextSeat, result: { success: true, msg: seatId + " 예약이 취소되었습니다." } };
  });

  if (result && result.success) {
    await releaseStudentClaim(studentId);
  }

  return jsonResponse(result);
};
