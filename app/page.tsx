// "use client"; <-- 가장 중요해요! 인터랙티브 효과를 위해 꼭 필요해요.
"use client";

import { useEffect, useState } from 'react';
import Hyperspeed from './components/Hyperspeed'; // 1. 컴포넌트를 가져옵니다.
import { hyperspeedPresets } from './components/presets'; // 프리셋도 가져옵니다.

// Post 데이터의 타입을 정의해줍니다.
interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
}

export default function Home() {
  // 데이터를 저장할 상태(state)를 만듭니다.
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // 컴포넌트가 처음 화면에 나타날 때 데이터를 불러옵니다.
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('https://jsonplaceholder.typicode.com/posts');
        const data = await res.json();
        setPosts(data);
      } catch (error) {
        console.error("데이터를 불러오는 데 실패했습니다.", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []); // []를 비워두면 처음 한 번만 실행됩니다.


  return (
    // 2. 배경과 콘텐츠를 감싸는 부모 div 입니다.
    // 배경(absolute) 위에 콘텐츠를 올리기 위해 relative 속성이 필요해요.
    <main style={{ position: 'relative', width: '100vw', height: '100vh', color: 'white' }}>

      {/* 3. Hyperspeed 배경 컴포넌트 입니다. */}
      <Hyperspeed
        effectOptions={{
          ...hyperspeedPresets.two // 프리셋 중 'two'를 적용했어요. one, three 등으로 바꿔보세요!
        }}
      />

      {/* 4. ✨ 여기에 커스텀 텍스트나 콘텐츠를 넣으세요! ✨ */}
      {/* 배경 위에 떠 있도록 스타일을 조정합니다. (position, zIndex) */}
      <div style={{
        position: 'relative', // 부모가 relative이므로 여기도 relative 또는 absolute
        zIndex: 10, // 숫자가 높을수록 위에 보입니다.
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        overflowY: 'auto', // 내용이 길어지면 스크롤 가능
        padding: '2rem' // 모바일 화면을 위한 여백
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem', textAlign: 'center' }}>Gatita's Blog</h1>
        <p style={{ marginBottom: '2rem', textAlign: 'center' }}>Welcome to the Hyperspeed World!</p>
        
        {/* 기존에 있던 게시물 목록 코드 */}
        <div style={{ maxWidth: '800px', width: '100%' }}>
          {loading ? (
            <p>Loading posts...</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} style={{
                background: 'rgba(0, 0, 0, 0.5)', // 반투명 배경
                backdropFilter: 'blur(5px)', // 뒷배경 블러 효과
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '1.5rem',
                margin: '1rem 0'
              }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{post.title}</h2>
                <p>{post.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
