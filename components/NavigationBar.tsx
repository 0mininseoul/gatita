import React from 'react';
import Image from 'next/image'; // Next.js 이미지 컴포넌트
import TextType from './TextType'; // 타이핑 애니메이션 컴포넌트
import { Search } from 'lucide-react'; // 돋보기 아이콘

interface NavigationBarProps {
  onFindClick: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ onFindClick }) => {
  // 내비게이션 바 전체 스타일
  const navStyle: React.CSSProperties = {
    width: 'calc(100% - 4rem)',
    maxWidth: '1200px',
    padding: '0.75rem 1.5rem', // 패딩 조정
    backgroundColor: 'rgba(28, 28, 30, 0.7)',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: "'Pretendard', sans-serif",
    backdropFilter: 'blur(10px)',
    color: 'white',
  };

  // "찾기" 버튼 스타일
  const findButtonStyle: React.CSSProperties = {
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    color: 'white',
    padding: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  };

  return (
    <nav style={navStyle}>
      {/* 왼쪽: 로고 + 타이핑 텍스트 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Image
          src="/icons/icon-512x512.png"
          alt="같이타 로고"
          width={32}
          height={32}
          priority // 이미지를 우선적으로 로드
        />
        <TextType
          text={[
            "AI 공학관 같이 갈 사람?",
            "교육대학원 같이 갈 사람?"
          ]}
          as="span"
          typingSpeed={70}
          deletingSpeed={40} // 지워지는 속도 추가
          pauseDuration={2000} // 멈춤 시간 조정
          loop={true} // 무한 반복 활성화
          showCursor={true}
          cursorCharacter="_"
          style={{
            fontFamily: "'Pretendard', sans-serif",
            fontWeight: 500,
            color: '#9CA3AF', // 회색 (placeholder 느낌)
            fontSize: '1rem',
            minWidth: '220px', // 텍스트 길이에 따른 레이아웃 깨짐 방지
          }}
        />
      </div>

      {/* 오른쪽: 돋보기 아이콘 버튼 */}
      <button 
        onClick={onFindClick} 
        style={findButtonStyle}
        onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
        onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <Search size={20} />
      </button>
    </nav>
  );
};

export default NavigationBar;
