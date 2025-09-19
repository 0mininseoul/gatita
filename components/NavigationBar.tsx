import React from 'react';

// "찾기" 버튼 클릭 시 실행할 함수를 props로 받기 위한 타입 정의
interface NavigationBarProps {
  onFindClick: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ onFindClick }) => {
  // 내비게이션 바 전체 스타일
  const navStyle: React.CSSProperties = {
    width: 'calc(100% - 4rem)',
    maxWidth: '1200px',
    padding: '1rem 2rem',
    backgroundColor: 'rgba(28, 28, 30, 0.7)',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: "'Pretendard', sans-serif", // Pretendard 폰트 적용
    backdropFilter: 'blur(10px)',
    color: 'white',
  };

  // 왼쪽 텍스트 스타일
  const leftTextStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
  };

  // "찾기" 버튼 스타일
  const findButtonStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    color: 'white',
    fontFamily: "'Pretendard', sans-serif", // 버튼에도 Pretendard 폰트 적용
    padding: '0',
  };

  return (
    <nav style={navStyle}>
      <div style={leftTextStyle}>AI 공학관 같이 갈 사람</div>
      {/* "찾기" 버튼 클릭 시 props로 받은 함수 실행 */}
      <button onClick={onFindClick} style={findButtonStyle}>
        찾기
      </button>
    </nav>
  );
};

export default NavigationBar;
