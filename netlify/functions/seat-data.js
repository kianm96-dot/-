import { getSeats, getOpenTime, jsonResponse } from "../lib/store.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const studentId = (url.searchParams.get("studentId") || "").trim();

  if (!/^\d{5}$/.test(studentId)) {
    return jsonResponse({ error: "학번은 5자리 숫자여야 합니다." }, 400);
  }

  const stuClass = parseInt(studentId.substring(1, 3), 10);
  const seats = await getSeats();

  if (!seats.length) {
    return jsonResponse({ error: "좌석 데이터가 아직 생성되지 않았습니다. 관리자에게 문의하세요." }, 404);
  }

  const seatMap = {};
  seats.forEach((s) => {
    seatMap[s.seatId] = {
      assignedClass: s.assignedClass,
      status: s.status,
    };
  });

  const mySeat = seats.find((s) => s.studentId === studentId && s.status === "예약완료");
  const myBookedSeatId = mySeat ? mySeat.seatId : "";

  const openTime = await getOpenTime();

  return jsonResponse({ seats: seatMap, studentClass: stuClass, openTime, myBookedSeatId });
};
