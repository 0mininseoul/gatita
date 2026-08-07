const SITE_URL = 'https://gatita.kro.kr'
const ROUTE_ALERT_SUBJECT = '같이타, 이제 경로를 등록해두면 방이 열릴 때 알려드려요'

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

export function createRouteAlertEmail(name: string) {
  const recipientName = escapeHtml(name.trim() || '회원')
  const routesUrl = `${SITE_URL}/routes?utm_source=feature_email&utm_medium=email&utm_campaign=route_alerts`
  const installGuideUrl = `${SITE_URL}/settings?utm_source=feature_email&utm_medium=email&utm_campaign=route_alerts`
  // Resend 발송 시 실제 회신 주소로 치환된다. 로컬 미리보기 등에서 값이
  // 없을 때도 메일 본문이 깨지지 않도록 안내 문구용 기본값을 둔다.
  const replyTo = process.env.RESEND_REPLY_TO || 'support@gatita.kro.kr'
  const unsubscribeMailto = `mailto:${replyTo}?subject=${encodeURIComponent('수신거부 요청')}`

  return {
    subject: ROUTE_ALERT_SUBJECT,
    text: `안녕하세요, ${name.trim() || '회원'}님.\n\n같이타에 새로운 기능이 생겼어요.\n\n이제 자주 다니는 경로를 등록해두면, 그 경로에 새 방이 열릴 때마다 알려드려요.\n매번 방 목록을 들여다보지 않아도, 나에게 맞는 방이 열리는 순간을 놓치지 않을 수 있어요.\n\n경로 등록하러 가기\n${routesUrl}\n\n참고로 iOS에서는 홈 화면에 같이타를 추가해야 알림을 받을 수 있어요.\n아직 추가하지 않으셨다면 로그인 후 설정 페이지에서 홈 화면 추가 안내를 확인해주세요.\n\n[같이타] 홈 화면 추가 안내 보기\n${installGuideUrl}\n\n이 메일은 같이타를 이용 중인 분들께 새 기능을 안내드리기 위해 보내드렸어요.\n더 이상 이런 안내를 받고 싶지 않으시면 이 메일에 회신 주시거나 아래 주소로 알려주세요. 바로 반영해드릴게요.\n${replyTo}\n\n감사합니다.\n박영민 드림.`,
    html: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f4f8fb;color:#344054;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif;word-break:keep-all;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f8fb;">
      <tr><td align="center" style="padding:24px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;">
          <tr><td style="padding:32px 20px 12px;">
            <h1 style="margin:0;color:#111827;font-size:26px;line-height:1.36;letter-spacing:-1.1px;font-weight:800;">경로를 등록해두면, 방이 열릴 때 알려드려요</h1>
          </td></tr>
          <tr><td style="padding:0 20px 40px;font-size:16px;line-height:1.82;letter-spacing:-0.28px;color:#475467;">
            <p style="margin:0 0 28px;">안녕하세요, ${recipientName}님.<br />같이타에 새로운 기능이 생겼어요.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background:#eef8ff;border-left:5px solid #3592d0;border-radius:14px;">
              <tr><td style="padding:22px 22px 21px;color:#31688f;">
                이제 자주 다니는 <strong style="font-weight:800;">경로를 등록해두면</strong>, 그 경로에 새 방이 열릴 때마다 알려드려요.<br /><br />매번 방 목록을 들여다보지 않아도, 나에게 맞는 방이 열리는 순간을 놓치지 않을 수 있어요.
              </td></tr>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 30px;"><tr><td style="border-radius:10px;background:#1677b9;">
              <a href="${routesUrl}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:-0.2px;">경로 등록하러 가기</a>
            </td></tr></table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background:#f8fafc;border:1px solid #e4eaf0;border-radius:14px;">
              <tr><td style="padding:22px;color:#475467;">
                참고로 iOS에서는 홈 화면에 같이타를 추가해야 알림을 받을 수 있어요.<br />아직 추가하지 않으셨다면 아래에서 홈 화면 추가 안내를 확인해주세요.<br /><br />
                <a href="${installGuideUrl}" style="color:#1677b9;text-decoration:underline;font-weight:700;">[같이타] 홈 화면 추가 안내 보기 →</a>
              </td></tr>
            </table>
            <p style="margin:32px 0 0;">감사합니다.<br />박영민 드림.</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;">
          <tr><td style="padding:14px 20px 0;color:#98a2b3;font-size:12px;line-height:1.6;">
            이 메일은 같이타를 이용 중인 분들께 새 기능을 안내드리기 위해 보내드렸어요.<br />
            더 이상 이런 안내를 받고 싶지 않으시면 이 메일에 회신 주시거나 <a href="${unsubscribeMailto}" style="color:#98a2b3;text-decoration:underline;">수신거부 요청</a>을 보내주세요. 바로 반영해드릴게요.
          </td></tr>
        </table>
        <p style="margin:14px 0 0;color:#98a2b3;font-size:11px;line-height:1.4;white-space:nowrap;">같이타 · 가천대학교 학생들을 위한 택시 동승 플랫폼</p>
      </td></tr>
    </table>
  </body>
</html>`,
  }
}

export async function sendRouteAlertEmail({ userId, email, name }: { userId: string; email: string; name: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const replyTo = process.env.RESEND_REPLY_TO

  if (!apiKey || !from || !replyTo) {
    throw new Error('Resend route alert email 환경변수가 설정되지 않았습니다')
  }

  const emailContent = createRouteAlertEmail(name)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // userId 기준 Idempotency-Key로, 스크립트를 재실행해도 같은 사람에게
      // 중복 발송되지 않는다 (welcome-email.ts와 동일한 패턴).
      'Idempotency-Key': `gatita-route-alerts/${userId}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: replyTo,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend route alert email 발송 실패: ${response.status}`)
  }

  return response.json() as Promise<{ id: string }>
}
