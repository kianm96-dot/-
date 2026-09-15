import { getOpenTime, updateSeatsAtomic, jsonResponse } from "../lib/store.mjs";

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
      const formatted = openTimeStr.replace("T", " ");
      return jsonResponse({
        success: false,
        msg: "아직 신청 시간이 아닙니다.\n신청 시작 시간: " + formatted,
      });
    }
  }

  const stuClass = parseInt(studentId.substring(1, 3), 10);

  const result = await updateSeatsAtomic((seats) => {
    // 이미 예약한 학번인지 확인
    const already = seats.find((s) => s.studentId === studentId);
    if (already) {
      return { seats, result: { success: false, msg: "이미 예약 완료된 내역이 있습니다.", __noChange: true } };
    }

    const idx = seats.findIndex((s) => s.seatId === seatId);
    if (idx === -1) {
      return { seats, result: { success: false, msg: "존재하지 않는 좌석입니다.", __noChange: true } };
    }

    const seat = seats[idx];
    if (seat.assignedClass === 0) {
      return { seats, result: { success: false, msg: "무대 및 휠체어석은 예약 불가합니다.", __noChange: true } };
    }
    if (seat.assignedClass !== stuClass) {
      return { seats, result: { success: false, msg: "본인 반 좌석만 예약 가능합니다.", __noChange: true } };
    }
    if (seat.status === "예약완료") {
      return { seats, result: { success: false, msg: "이미 마감된 좌석입니다.", __noChange: true } };
    }

    const nextSeats = seats.slice();
    nextSeats[idx] = { ...seat, status: "예약완료", studentId, studentName: name };

    return {
      seats: nextSeats,
      result: { success: true, msg: seatId + " 예약 완료!" },
    };
  });

  return jsonResponse(result);
};
