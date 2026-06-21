// 채팅방 청크/세그먼트 로드 중 빈 화면 대신 즉시 보여줄 스켈레톤.
// 실제 데이터 패칭은 클라이언트 컴포넌트가 마운트된 뒤 처리한다.
export default function ChatRoomLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-white" aria-busy="true" aria-label="채팅방 불러오는 중">
      {/* 헤더 자리 */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="h-5 w-44 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-gray-100" />
      </div>

      {/* 메시지 자리 */}
      <div className="flex-1 space-y-3 px-4 py-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`flex ${index % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`h-9 animate-pulse rounded-2xl bg-gray-100 ${index % 2 === 0 ? 'w-40' : 'w-28'}`}
            />
          </div>
        ))}
      </div>

      {/* 입력창 자리 */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="h-10 w-full animate-pulse rounded-full bg-gray-100" />
      </div>
    </div>
  )
}
