// "use client"; <-- 인터랙티브 배경 효과를 위해 꼭 필요해요!
"use client";

import Link from 'next/link'; // 페이지 이동을 위한 Link 컴포넌트를 가져옵니다.
import Hyperspeed from './components/Hyperspeed';
import { hyperspeedPresets } from './components/presets';

export default function Home() {
  return (
    // 배경과 콘텐츠를 감싸는 부모 main 태그입니다.
    // 검은 배경색을 지정하고, 내부 콘텐츠가 화면 전체를 채우도록 설정합니다.
    <main style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000', // 배경을 검은색으로 설정합니다.
      color: 'white', // 기본 글자색을 흰색으로 합니다.
    }}>

      {/* 1. Hyperspeed 배경 컴포넌트 */}
      {/* 화면 전체를 덮도록 zIndex를 -1로 설정하여 다른 콘텐츠보다 뒤에 배치합니다. */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <Hyperspeed
          effectOptions={{
            ...hyperspeedPresets.two // 원하시는 다른 프리셋으로 변경 가능합니다.
          }}
        />
      </div>


      {/* 2. 화면 중앙에 표시될 UI 콘텐츠 */}
      {/* zIndex를 10으로 설정하여 배경 컴포넌트 위에 표시되도록 합니다. */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '1rem' // 모바일 화면을 위한 여백
      }}>
        
        {/* 중앙 메인 텍스트 */}
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', // 화면 크기에 따라 글자 크기 조절
          fontWeight: 'bold',
          marginBottom: '1rem'
        }}>
          Gatita
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
          maxWidth: '600px',
          marginBottom: '2.5rem',
          color: 'rgba(255, 255, 255, 0.8)'
        }}>
          Click & hold to speed up
        </p>

        {/* 로그인, 회원가입 버튼 컨테이너 */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          
          {/* 로그인 버튼 */}
          <Link href="/login" passHref>
            <button style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#000',
              backgroundColor: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              로그인
            </button>
          </Link>

          {/* 회원가입 버튼 */}
          <Link href="/signup" passHref>
            <button style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: 'transparent',
              border: '1px solid #fff',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s, transform 0.2s',
            }}
            onMouseOver={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
            }}
            >
              회원가입
            </button>
          </Link>

        </div>
      </div>
    </main>
  );
}
