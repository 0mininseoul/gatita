// /map 세그먼트 로드 중 빈 화면 대신 즉시 보여줄 로더.
// 실제 지도/세션 확인은 클라이언트 컴포넌트가 마운트된 뒤 처리한다.
export default function MapLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white" aria-busy="true" aria-label="지도 불러오는 중">
      <div className="loading-spinner" />
    </div>
  )
}
