import { generateSeats, setSeatsInitial, isAdminAuthorized, jsonResponse } from "../lib/store.mjs";

export default async (req) => {
  if (!isAdminAuthorized(req)) {
    return jsonResponse({ success: false, msg: "관리자 인증이 필요합니다." }, 401);
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 405);
  }

  const seats = generateSeats();
  await setSeatsInitial(seats);

  return jsonResponse({
    success: true,
    msg: "전체 호차 좌석 배치 DB 재생성 완료! 총 " + seats.length + "개 좌석이 설정되었습니다.",
  });
};
