import {
  getOpenTime,
  claimStudentSeat,
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
  const name = String(body.name || "").trim();
  const seatId = String(body.seatId || "").trim();

  if (!/^\d{5}$/.test(studentId) || !name || !seatId) {
    return jsonResponse({ success: false, msg: "입력값을 확인해주세요." }, 400);
  }

  // 선착순 시간 검증
  const openTimeStr = await getOpenTime();
  if (openTimeStr) {
    const openTime = new Date(openTimeStr);
    const now = new Date();
    if (now < openTime) {
      const formatted = openTimeStr.slice(0, 16).replace("T", " ");
      return jsonResponse({
        success: false,
        msg: "아직 신청 시간이 아닙니다.\n신청 시작 시간: " + formatted,
      });
    }
  }

  const stuClass = parseInt(studentId.substring(1, 3), 10);

  // 1) 학번당 1좌석만 예약 가능하도록 먼저 선점(claim) 시도.
  //    이 단계는 학번별로 독립적인 키라서, 다른 학생과는 절대 충돌하지 않는다.
  const claimed = await claimStudentSeat(studentId, seatId);
  if (!claimed) {
    return jsonResponse({ success: false, msg: "이미 예약 완료된 내역이 있습니다." });
  }

  // 2) 실제 좌석에 대해 원자적으로 배정 시도.
  //    이 단계도 좌석별로 독립된 키라서, "정확히 같은 좌석"을 동시에 누른
  //    경우에만 충돌하고 자동 재시도로 처리된다.
  const result = await updateSeatAtomic(seatId, (seat) => {
    if (seat.assignedClass === 0) {
      return { seat, result: { success: false, msg: "무대 및 휠체어석은 예약 불가합니다.", __noChange: true } };
    }
    if (seat.assignedClass !== stuClass) {
      return { seat, result: { success: false, msg: "본인 반 좌석만 예약 가능합니다.", __noChange: true } };
    }
    if (seat.status === "예약완료") {
      return { seat, result: { success: false, msg: "이미 마감된 좌석입니다.", __noChange: true } };
    }
    const nextSeat = { ...seat, status: "예약완료", studentId, studentName: name };
    return { seat: nextSeat, result: { success: true, msg: seatId + " 예약 완료!" } };
  });

  if (!result || !result.success) {
    // 좌석 확보에 실패했으면, 선점해뒀던 학번 슬롯을 반납해서 다시 시도할 수 있게 한다.
    await releaseStudentClaim(studentId);
  }

  return jsonResponse(result || { success: false, msg: "예약 처리 중 오류가 발생했습니다." });
};
