import React from 'react';
import Image from 'next/image'; // Next.js 이미지 컴포넌트
import TextType from './TextType'; // 타이핑 애니메이션 컴포넌트
import { Search } from 'lucide-react'; // 돋보기 아이콘

interface NavigationBarProps {
  onFindClick: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ onFindClick }) => {
  const navStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '1200px',
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(28, 28, 30, 0.7)',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: 'var(--font-paperlogy), sans-serif',
    backdropFilter: 'blur(10px)',
    color: 'white',
    gap: '0.75rem',
  };

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
    flex: '0 0 auto',
  };

  return (
    <nav style={navStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
        <Image
          src="/brand/gatita-logo.png"
          alt="같이타 로고"
          width={32}
          height={32}
          priority
          style={{ flex: '0 0 auto' }}
        />
        <TextType
          text={[
            "AI 공학관 같이 갈 사람?",
            "교육대학원 같이 갈 사람?",
            "제3기숙사 같이 갈 사람?",
            "제2기숙사 같이 갈 사람?"
          ]}
          as="span"
          typingSpeed={70}
          deletingSpeed={40}
          pauseDuration={2000}
          loop={true}
          showCursor={true}
          cursorCharacter="_"
          style={{
            fontFamily: 'var(--font-paperlogy), sans-serif',
            fontWeight: 500,
            color: '#9CA3AF',
            fontSize: '0.9375rem',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        />
      </div>

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
