import {
  getAllSeats,
  getOpenTime,
  getStudentRoster,
  isAdminAuthorized,
  jsonResponse,
} from "../lib/store.mjs";

export default async (req) => {
  if (!isAdminAuthorized(req)) {
    return jsonResponse({ error: "관리자 인증이 필요합니다." }, 401);
  }

  const [seats, openTime, roster] = await Promise.all([
    getAllSeats(),
    getOpenTime(),
    getStudentRoster(),
  ]);

  const seatMap = {};
  let totalBooked = 0;
  const bookedMap = {}; // studentId -> seatId
  seats.forEach((s) => {
    if (s.status === "예약완료") {
      totalBooked++;
      if (s.studentId) bookedMap[s.studentId] = s.seatId;
    }
    seatMap[s.seatId] = {
      assignedClass: s.assignedClass,
      status: s.status,
      studentId: s.studentId,
      studentName: s.studentName,
    };
  });

  const notApplied = roster.filter((r) => !bookedMap[r.studentId]);

  return jsonResponse({
    seats: seatMap,
    totalSeats: seats.length,
    totalBooked,
    openTime,
    rosterCount: roster.length,
    notApplied,
    roster,
    bookedMap,
  });
};
