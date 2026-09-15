import { getAllSeats, getOpenTime, isAdminAuthorized, jsonResponse } from "../lib/store.mjs";

export default async (req) => {
  if (!isAdminAuthorized(req)) {
    return jsonResponse({ error: "관리자 인증이 필요합니다." }, 401);
  }

  const [seats, openTime] = await Promise.all([getAllSeats(), getOpenTime()]);

  const seatMap = {};
  let totalBooked = 0;
  seats.forEach((s) => {
    if (s.status === "예약완료") totalBooked++;
    seatMap[s.seatId] = {
      assignedClass: s.assignedClass,
      status: s.status,
      studentId: s.studentId,
      studentName: s.studentName,
    };
  });

  return jsonResponse({
    seats: seatMap,
    totalSeats: seats.length,
    totalBooked,
    openTime,
  });
};
