import { updateSeatsAtomic, jsonResponse } from "../lib/store.mjs";

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

  const result = await updateSeatsAtomic((seats) => {
    const idx = seats.findIndex((s) => s.seatId === seatId);
    if (idx === -1) {
      return { seats, result: { success: false, msg: "존재하지 않는 좌석입니다.", __noChange: true } };
    }
    const seat = seats[idx];
    if (seat.status !== "예약완료" || seat.studentId !== studentId) {
      return { seats, result: { success: false, msg: "본인이 예약한 좌석만 취소할 수 있습니다.", __noChange: true } };
    }
    const nextSeats = seats.slice();
    nextSeats[idx] = { ...seat, status: "", studentId: "", studentName: "" };
    return { seats: nextSeats, result: { success: true, msg: seatId + " 예약이 취소되었습니다." } };
  });

  return jsonResponse(result);
};
