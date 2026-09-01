const SITE_URL = 'https://gatita.kro.kr'
const WELCOME_SUBJECT = '같이타에 오신 걸 환영합니다! 🎉'

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

export function createWelcomeEmail(name: string) {
  const recipientName = escapeHtml(name.trim() || '회원')
  const installUrl = `${SITE_URL}/settings?utm_source=welcome_email&utm_medium=email&utm_campaign=welcome`
  const shareUrl = `${SITE_URL}/?share=1&utm_source=welcome_email&utm_medium=email&utm_campaign=welcome`

  return {
    subject: WELCOME_SUBJECT,
    text: `안녕하세요, ${name || '회원'}님.\n\n같이타를 만든 가천대 경영학과 박영민입니다.\n\n같이타에 가입해주셔서 정말 고맙습니다.\n\n같이타는 제가 가천대역에서 AI공학관까지 오가며 느꼈던 이동의 불편함에서 시작한 서비스예요. 가천대 학생들이 같은 방향으로 이동하는 학우를 찾아 택시비 부담을 나눌 수 있도록 만들었어요.\n\n서비스 오픈한 지 아직 2달도 안 됐지만, 감사하게도 지금까지 100명 이상의 가천대 학우 분들이 같이타에 가입해 주셨어요.\n아직 초기 서비스라 방이 가득하지 않을 수 있지만, 원하시는 경로로 방을 먼저 개설해보시면 같이 동행할 분들이 보시고 들어오실 거예요!\n\n홈 화면에 같이타를 추가해두고, 필요할 때 앱처럼 바로 열어보세요. 채팅 알림도 놓치지 않고 받을 수 있어요.\n\n[같이타] 로그인 후 홈 화면 추가하기\n${installUrl}\n\n친구 한 명과 함께 시작해 보세요\n같은 방향으로 자주 이동하는 친구 한 명에게 같이타를 알려주시면, 필요한 순간 함께 탈 사람을 찾기가 더 쉬워져요.\n\n친구에게 같이타 알려주기 →\n${shareUrl}\n\n궁금한 점이나 불편한 점이 있다면 이 메일에 편하게 답장해주세요. 빠르게 확인하고 답장 드릴게요.\n\n감사합니다.\n박영민 드림.`,
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
            <h1 style="margin:0;color:#111827;font-size:30px;line-height:1.32;letter-spacing:-1.3px;font-weight:800;">같이타에 오신 걸 환영합니다!</h1>
          </td></tr>
          <tr><td style="padding:20px 20px 28px;">
            <img src="${SITE_URL}/og-image.png" alt="같이타 - 가천대학생들을 위한 택시 동승 플랫폼" width="552" style="display:block;width:100%;max-width:552px;height:auto;border:1px solid #edf1f5;border-radius:16px;" />
          </td></tr>
          <tr><td style="padding:0 20px 40px;font-size:16px;line-height:1.82;letter-spacing:-0.28px;color:#475467;">
            <p style="margin:0 0 28px;">안녕하세요, ${recipientName}님.<br />같이타를 만든 가천대 경영학과 박영민입니다.</p>
            <p style="margin:0 0 28px;">같이타에 가입해주셔서 정말 고맙습니다.</p>
            <p style="margin:0 0 28px;">같이타는 제가 가천대역에서 AI공학관까지 오가며 느꼈던 이동의 불편함에서 시작한 서비스예요. 가천대 학생들이 같은 방향으로 이동하는 학우를 찾아 택시비 부담을 나눌 수 있도록 만들었어요.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background:#eef8ff;border-left:5px solid #3592d0;border-radius:14px;">
              <tr><td style="padding:22px 22px 21px;color:#31688f;">
                서비스 오픈한 지 아직 2달도 안 됐지만, 감사하게도 지금까지 <strong style="font-weight:800;">100명 이상의 가천대 학우 분들이</strong> 같이타에 가입해 주셨어요.<br /><br />아직 초기 서비스라 방이 가득하지 않을 수 있지만, 원하시는 경로로 방을 먼저 개설해보시면 같이 동행할 분들이 보시고 들어오실 거예요!
              </td></tr>
            </table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background:#f8fafc;border:1px solid #e4eaf0;border-radius:14px;">
              <tr><td style="padding:22px;color:#475467;">홈 화면에 같이타를 추가해두고, 필요할 때 앱처럼 바로 열어보세요. 채팅 알림도 놓치지 않고 받을 수 있어요.</td></tr>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 30px;"><tr><td style="border-radius:10px;background:#1677b9;">
              <a href="${installUrl}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:-0.2px;">[같이타] 로그인 후 홈 화면 추가하기</a>
            </td></tr></table>
            <div style="padding-top:28px;border-top:1px solid #e9eef3;">
              <p style="margin:0 0 14px;color:#344054;font-weight:700;">친구 한 명과 함께 시작해 보세요</p>
              <p style="margin:0 0 24px;">같은 방향으로 자주 이동하는 친구 한 명에게 같이타를 알려주시면, 필요한 순간 함께 탈 사람을 찾기가 더 쉬워져요.</p>
              <a href="${shareUrl}" style="color:#1677b9;text-decoration:underline;font-weight:700;">친구에게 같이타 알려주기 →</a>
            </div>
            <p style="margin:32px 0 0;">궁금한 점이나 불편한 점이 있다면 이 메일에 편하게 답장해주세요. 빠르게 확인하고 답장 드릴게요.</p>
            <p style="margin:28px 0 0;">감사합니다.<br />박영민 드림.</p>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;color:#98a2b3;font-size:11px;line-height:1.4;white-space:nowrap;">같이타 · 가천대학교 학생들을 위한 택시 동승 플랫폼</p>
      </td></tr>
    </table>
  </body>
</html>`,
  }
}

export async function sendWelcomeEmail({ userId, email, name }: { userId: string; email: string; name: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const replyTo = process.env.RESEND_REPLY_TO

  if (!apiKey || !from || !replyTo) {
    throw new Error('Resend welcome email 환경변수가 설정되지 않았습니다')
  }

  const emailContent = createWelcomeEmail(name)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `gatita-welcome/${userId}`,
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
    throw new Error(`Resend welcome email 발송 실패: ${response.status}`)
  }

  return response.json() as Promise<{ id: string }>
}
