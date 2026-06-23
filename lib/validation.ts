// 룰베이스(AI 미사용) 입력 검증.
// 형식 검증(전화번호 regex, 은행별 계좌 자릿수)은 통과하지만 "아무거나 찍은" 명백한 가짜 값
// (0000-0000, 1234-1234, 4444... 계좌, 'ㄴㄴ' 예금주 등)을 걸러낸다.
// 클라이언트 폼과 서버 API에서 동일하게 재사용한다.

const PHONE_REGEX = /^010-\d{4}-\d{4}$/

// 완성형 한글 이름(2~10자). 자모(ㄱ~ㅎ, ㅏ~ㅣ)나 숫자/특수문자가 섞이면 불통과.
const HANGUL_NAME_REGEX = /^[가-힣]{2,10}$/
// 영문 이름(공백 허용, 2~40자). 외국인 학생/영문 예금주 대응.
const ENGLISH_NAME_REGEX = /^[A-Za-z][A-Za-z\s.]{1,39}$/

/** 모든 글자가 같은 문자로만 이루어졌는지 (0000, ㄴㄴ, aaaa ...) */
function isAllSameChar(value: string) {
  return value.length > 0 && /^(.)\1+$/.test(value)
}

/** 1씩 증가(1234...) 또는 1씩 감소(8765...)하는 완전 연속 수열인지 */
function isSequentialRun(digits: string) {
  if (digits.length < 2) return false
  let ascending = true
  let descending = true
  for (let i = 1; i < digits.length; i++) {
    const diff = Number(digits[i]) - Number(digits[i - 1])
    if (diff !== 1) ascending = false
    if (diff !== -1) descending = false
  }
  return ascending || descending
}

/** 서로 다른 숫자의 개수 (저엔트로피 판별용) */
function distinctDigitCount(digits: string) {
  return new Set(digits).size
}

/**
 * 전화번호 검증. 형식(010-0000-0000) + 명백한 가짜 패턴 차단.
 * 통과 시 null, 실패 시 사용자에게 보여줄 메시지를 반환.
 */
export function validatePhoneNumber(value: string): string | null {
  const trimmed = value.trim()
  if (!PHONE_REGEX.test(trimmed)) {
    return '010-0000-0000 형식으로 입력해주세요'
  }

  // 010 뒤 가입자 번호 8자리만 검사
  const subscriber = trimmed.replace(/\D/g, '').slice(3)

  // 0000-0000 처럼 전부 같은 숫자
  if (isAllSameChar(subscriber)) {
    return '실제 사용하는 전화번호를 입력해주세요'
  }
  // 1234-5678 / 8765-4321 처럼 완전 연속
  if (isSequentialRun(subscriber)) {
    return '실제 사용하는 전화번호를 입력해주세요'
  }
  // 1234-1234 처럼 앞 4자리 == 뒤 4자리
  if (subscriber.slice(0, 4) === subscriber.slice(4)) {
    return '실제 사용하는 전화번호를 입력해주세요'
  }
  // 1212-1212, 1111-2222 처럼 서로 다른 숫자가 2개 이하인 저엔트로피
  if (distinctDigitCount(subscriber) <= 2) {
    return '실제 사용하는 전화번호를 입력해주세요'
  }

  return null
}

/**
 * 예금주(계좌주) 이름 검증. 완성형 한글 또는 영문만 허용하고
 * 자모('ㄴㄴ')·반복 글자('가가')를 차단.
 * 통과 시 null, 실패 시 메시지 반환.
 */
export function validateAccountHolderName(value: string): string | null {
  const name = value.trim()
  if (name.length < 2) {
    return '예금주 이름을 2자 이상 입력해주세요'
  }

  const isHangul = HANGUL_NAME_REGEX.test(name)
  const isEnglish = ENGLISH_NAME_REGEX.test(name)
  // 완성형 한글도 영문도 아니면 자모/숫자/특수문자가 섞인 가짜 입력
  if (!isHangul && !isEnglish) {
    return '예금주 이름을 정확히 입력해주세요'
  }
  // '가가', 'aa' 처럼 같은 글자 반복
  if (isAllSameChar(name.replace(/\s/g, ''))) {
    return '예금주 이름을 정확히 입력해주세요'
  }

  return null
}

/**
 * 계좌번호의 명백한 가짜 패턴 차단. (은행별 자릿수 형식 검증은
 * isAccountNumberCompleteForBank 가 따로 수행하므로 여기서는 패턴만 본다.)
 * 통과 시 null, 실패 시 메시지 반환.
 */
export function validateAccountNumberPattern(accountNumber: string): string | null {
  const digits = accountNumber.replace(/\D/g, '')
  // 형식 검증 단계에서 자릿수는 이미 확인되므로 너무 짧으면 패턴 검사 생략
  if (digits.length < 6) return null

  // 4444444... 처럼 전부 같은 숫자
  if (isAllSameChar(digits)) {
    return '실제 계좌번호를 입력해주세요'
  }
  // 123456789 처럼 완전 연속
  if (isSequentialRun(digits)) {
    return '실제 계좌번호를 입력해주세요'
  }
  // 서로 다른 숫자가 2개 이하 (12121212 등) — 10자리 이상 실계좌에서는 사실상 발생하지 않음
  if (distinctDigitCount(digits) <= 2) {
    return '실제 계좌번호를 입력해주세요'
  }

  return null
}
