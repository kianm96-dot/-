import {
  getSeat,
  setSeatForce,
  getStudentSeatId,
  setStudentClaim,
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
  const studentId = String(body.studentId || "").trim();
  const studentName = String(body.studentName || "").trim();

  if (!seatId || !studentId || !studentName) {
    return jsonResponse({ success: false, msg: "좌석번호, 학번, 이름을 모두 입력해주세요." }, 400);
  }

  const seat = await getSeat(seatId);
  if (!seat) {
    return jsonResponse({ success: false, msg: "좌석을 찾을 수 없습니다." });
  }

  // 이 학번이 이미 다른 좌석을 예약해둔 상태라면, 그 좌석은 비워준다(이중 예약 방지).
  const prevSeatId = await getStudentSeatId(studentId);
  if (prevSeatId && prevSeatId !== seatId) {
    const prevSeat = await getSeat(prevSeatId);
    if (prevSeat) {
      await setSeatForce(prevSeatId, { ...prevSeat, status: "", studentId: "", studentName: "" });
    }
  }

  // 대상 좌석에 다른 학생이 이미 앉아있었다면, 그 학생의 예약 기록도 정리한다.
  if (seat.status === "예약완료" && seat.studentId && seat.studentId !== studentId) {
    await releaseStudentClaim(seat.studentId);
  }

  await setSeatForce(seatId, { ...seat, status: "예약완료", studentId, studentName });
  await setStudentClaim(studentId, seatId);

  return jsonResponse({ success: true, msg: seatId + " 배정 완료!" });
};
