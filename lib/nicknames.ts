import rawNicknameSamples from './nicknameSamples.json'

const validNicknameSamples = rawNicknameSamples
  .map((sample) => sample.trim())
  .filter((sample) => sample.length > 0)

export const NICKNAME_SAMPLES = validNicknameSamples.length > 0 ? validNicknameSamples : ['가천대']

// 미리 정해둔 샘플에서 하나를 뽑아 뒤에 랜덤 숫자만 붙인다(AI 미사용).
// 닉네임 규칙(2–10자)을 지키도록 숫자 자릿수를 동적으로 제한한다.
export function generateRandomNickname(exclude?: string): string {
  const pick = () => {
    const sample = NICKNAME_SAMPLES[Math.floor(Math.random() * NICKNAME_SAMPLES.length)]
    const base = sample.slice(0, 9)
    const maxDigits = Math.min(4, Math.max(1, 10 - base.length))
    const digitCount = 1 + Math.floor(Math.random() * maxDigits)
    const max = 10 ** digitCount - 1
    const suffix = Math.floor(Math.random() * (max + 1))
    return `${base}${suffix}`
  }

  let candidate = pick()
  for (let attempt = 0; attempt < 8 && candidate === exclude; attempt += 1) {
    candidate = pick()
  }
  return candidate
}
