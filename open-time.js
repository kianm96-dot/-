import { getOpenTime, setOpenTime, isAdminAuthorized, jsonResponse } from "../lib/store.mjs";

export default async (req) => {
  if (req.method === "GET") {
    const openTime = await getOpenTime();
    return jsonResponse({ openTime });
  }

  if (req.method === "POST") {
    if (!isAdminAuthorized(req)) {
      return jsonResponse({ success: false, msg: "관리자 인증이 필요합니다." }, 401);
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 400);
    }
    const timeStr = String(body.openTime || "").trim();
    await setOpenTime(timeStr);
    return jsonResponse({
      success: true,
      msg: timeStr ? "신청 시작 시간이 설정되었습니다." : "신청 시간 제한이 해제되었습니다.",
    });
  }

  return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 405);
};
