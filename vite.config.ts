/**
 * Vite 설정 파일
 * ===============
 * Vite 는 프론트엔드(React)를 빌드하고 개발 서버를 띄울 때 사용하는 도구입니다.
 * 여기서 포트, 환경 변수 주입, 경로 별칭(alias) 등을 설정합니다.
 */

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// defineConfig 의 콜백이 받는 mode: 'development' | 'production' 등
export default defineConfig(({ mode }) => {
    // .env, .env.local, .env.development 등에서 mode 에 맞는 변수를 읽어 옴
    const env = loadEnv(mode, '.', '');
    return {
      // 개발 서버 설정 (npm run dev 시)
      server: {
        port: 3000,        // 로컬에서 http://localhost:3000 으로 접속
        host: '0.0.0.0',  // 같은 네트워크의 다른 기기에서도 접속 가능 (예: 폰에서 테스트)
      },
      // React JSX/TSX 변환 등
      plugins: [react()],
      // 빌드 시 코드 안의 process.env.GEMINI_API_KEY 를 실제 환경 변수 값으로 치환
      // (브라우저에는 process.env 가 없으므로, Vite 가 빌드 타임에 문자열로 넣어 줌)
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      // import 시 '@' 가 프로젝트 루트를 가리키도록 함 (예: import x from '@/components/X')
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
