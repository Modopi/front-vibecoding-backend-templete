# 학습용 용어 정리 (Glossary)

이 문서는 프로젝트 코드와 주석에서 사용된 **전문 용어**를 주니어 개발자가 이해할 수 있도록 풀어서 정리한 것입니다. 알파벳 순이 아니라, 흐름에 맞춰 읽기 쉽게 묶었습니다.

---

## 1. 서버·네트워크 기본

### Express
Node.js 위에서 동작하는 **웹 서버 프레임워크**입니다.  
URL 경로별로 처리 함수(라우트)를 등록하고, 요청/응답을 쉽게 다룰 수 있게 해 줍니다.  
예: `app.get('/', ...)` → "누군가 GET / 로 접속하면 이 함수 실행".

### 미들웨어 (Middleware)
**요청이 라우트 핸들러에 도달하기 전·후에 실행되는 함수**입니다.  
로그 남기기, 본문 파싱(express.json), 인증 체크, Rate Limit 등에 쓰입니다.  
`app.use(미들웨어)` 로 등록하고, `next()` 를 호출하면 다음 미들웨어나 라우트로 넘어갑니다.

### 포트 (Port)
한 컴퓨터에서 **어떤 프로그램이 네트워크 통신을 받을지 구분하는 번호**입니다.  
예: 3000번 포트에서 서버가 떠 있으면 `http://localhost:3000` 으로 접속합니다.

### 환경 변수 (Environment Variable)
**프로그램 밖에서 설정하는 값**으로, 코드에 비밀번호·API 키를 직접 넣지 않기 위해 씁니다.  
예: `process.env.PORT`, `process.env.GEMINI_API_KEY`.  
로컬에서는 `.env` / `.env.local` 파일에 쓰고, 배포 시에는 서버/컨테이너 설정에서 넣습니다.

### dotenv
`.env` 파일을 읽어서 `process.env` 에 자동으로 채워 주는 라이브러리입니다.  
`require('dotenv').config()` 한 번 호출하면, 그 다음부터 `process.env.GEMINI_API_KEY` 같은 값이 사용 가능해집니다.

---

## 2. API·프록시

### API (Application Programming Interface)
**다른 프로그램(또는 서버)이 우리 프로그램의 기능을 호출할 수 있게 만든 인터페이스**입니다.  
웹에서는 보통 "특정 URL로 HTTP 요청을 보내면, 정해진 형식의 데이터를 돌려주는 것"을 말합니다.

### API 키 (API Key)
**외부 API를 쓸 때 필요한 비밀 문자열**입니다.  
요청 헤더(예: `X-Goog-Api-Key`)나 쿼리에 넣어 보내면, 서버가 "이 키를 가진 사용자구나" 하고 인증합니다.  
키가 노출되면 다른 사람이 우리 비용으로 API를 쓸 수 있으므로, **브라우저에 직접 넣지 않고 서버에서만 사용**하는 것이 좋습니다.

### 프록시 (Proxy)
**클라이언트 대신 다른 서버에 요청을 보내고, 응답을 다시 클라이언트에게 전달하는 중간 서버**입니다.  
이 프로젝트에서는 "브라우저 → 우리 서버(/api-proxy) → Gemini API" 구조로, API 키는 우리 서버에만 있고 브라우저에는 보이지 않게 합니다.

### REST API
**HTTP 메서드(GET, POST, PUT, DELETE 등)와 URL로 자원을 다루는 API 스타일**입니다.  
예: `GET /v1/models` → 모델 목록 조회, `POST /v1/.../generateContent` → 생성 요청.

### 스트리밍 (Streaming)
**응답 전체를 한 번에 보내지 않고, 준비되는 대로 조금씩(청크 단위로) 보내는 방식**입니다.  
AI 답변이 길 때 "한 번에 다 기다리지 않고 글자 단위로 보여 주는" 것이 스트리밍입니다.  
서버에서는 `responseType: 'stream'` 으로 받아서 `res.write(chunk)` 로 클라이언트에 바로 전달합니다.

### 업스트림 (Upstream)
**우리 서버보다 "앞쪽"에 있는 서버**를 말합니다.  
즉, 우리가 프록시라면 "실제 API를 제공하는 서버(Gemini)"가 업스트림입니다.

---

## 3. HTTP·CORS

### HTTP 메서드
- **GET**: 자원 조회 (보통 본문 없음)
- **POST**: 자원 생성·제출 (본문에 JSON 등)
- **PUT / PATCH**: 수정
- **DELETE**: 삭제
- **OPTIONS**: 실제 요청 전에 "이 메서드·헤더 허용하나요?" 묻는 용도 (CORS preflight)

### 헤더 (Header)
**HTTP 요청/응답에 붙는 메타정보**입니다.  
예: `Content-Type: application/json`, `X-Goog-Api-Key: ...`, `Host: example.com`.  
브라우저가 보낸 요청을 그대로 다른 서버로 넘길 때는 `Host` 같은 건 우리가 보내는 요청에 맞게 바꿔야 합니다.

### CORS (Cross-Origin Resource Sharing)
**다른 도메인/포트(오리진)로 요청을 보낼 때, 브라우저가 적용하는 보안 규칙**입니다.  
서버가 "이 오리진은 허용한다"고 응답 헤더(`Access-Control-Allow-Origin` 등)로 알려줘야, 브라우저가 응답을 페이지에 넘겨 줍니다.  
우리 프로젝트는 프론트와 백이 같은 오리진(같은 포트)으로 서빙되므로, 프록시만 허용해 주면 됩니다.

### Preflight (프리플라이트)
**실제 POST/GET 전에 브라우저가 먼저 보내는 OPTIONS 요청**입니다.  
"이 헤더·메서드 써도 되나요?" 하고 물어보고, 서버가 200 + CORS 헤더로 답하면 그다음에 본 요청을 보냅니다.

### 오리진 (Origin)
**프로토콜 + 도메인 + 포트** 조합입니다.  
예: `https://example.com:3000`.  
같은 오리진이면 "같은 사이트"로 보고, 쿠키·스토리지 접근 등이 자유롭습니다.

---

## 4. WebSocket

### WebSocket
**한 번 연결한 뒤, 서버와 클라이언트가 계속 양방향으로 메시지를 주고받을 수 있는 통신 방식**입니다.  
HTTP는 "요청 → 응답" 한 번이 끝이지만, WebSocket은 연결을 유지한 채로 실시간 채팅·스트리밍에 적합합니다.

### Upgrade (업그레이드)
**기존 HTTP 연결을 WebSocket 프로토콜로 바꾸는 것**입니다.  
클라이언트가 `Upgrade: websocket` 헤더로 요청하면, 서버가 101 Switching Protocols 로 응답하고 그 후부터 WebSocket 프레임으로 통신합니다.

### wss:// / ws://
- **ws://**: WebSocket 의 일반(비암호) 주소
- **wss://**: TLS 암호화된 WebSocket (https 와 같은 관계)

---

## 5. 브라우저·프론트 관련

### Service Worker (SW)
**브라우저가 백그라운드에서 돌리는 스크립트**로, **해당 사이트의 네트워크 요청을 가로챌 수 있습니다**.  
이 프로젝트에서는 "Gemini API 로 가는 fetch"를 가로채서, 같은 사이트의 `/api-proxy` 로 보내 줍니다.  
오프라인 캐시, 푸시 알림 등에도 쓰입니다.

### 인터셉터 (Interceptor)
**원래 가려던 대상(URL, WebSocket 등)을 중간에서 가로채서 다른 곳으로 돌리는 것**입니다.  
이 프로젝트의 `websocket-interceptor.js` 는 `new WebSocket('wss://generativelanguage...')` 를 가로채서 `wss://우리서버/api-proxy/...` 로 바꿉니다.

### Proxy (JavaScript)
**객체의 속성 접근·생성자 호출 등을 가로채서 다른 동작을 하게 만드는 JavaScript 기능**입니다.  
`new Proxy(대상, { construct(...) { ... } })` 로 "생성자 호출 시 인자를 바꿔서 넘기기" 같은 걸 할 수 있습니다.

### defer (스크립트 속성)
`<script src="..." defer>` 이면 **HTML 파싱이 끝난 뒤에 스크립트를 실행**합니다.  
페이지 그리기를 막지 않으면서, DOM 이 준비된 후에 스크립트가 돌게 할 때 씁니다.

---

## 6. Rate Limit·보안

### Rate Limit (요청 제한)
**같은 클라이언트(보통 IP)가 일정 시간 안에 보낼 수 있는 요청 횟수를 제한**하는 것입니다.  
과도한 호출·악용·DDoS 완화에 사용합니다.  
이 프로젝트에서는 15분에 IP당 100번까지로 제한합니다.

### DDoS
**많은 요청을 동시에 보내서 서버를 마비시키는 공격**입니다.  
Rate limit 은 그 피해를 줄이는 방법 중 하나입니다.

### trust proxy
Express 설정으로, **우리 서버 앞에 있는 프록시/로드밸런서가 클라이언트 IP 를 헤더로 넘겨줄 때** 그걸 믿고 `req.ip` 에 반영하도록 하는 옵션입니다.  
`app.set('trust proxy', 1)` 이면 "프록시 1대만 거쳤다"고 가정합니다.

---

## 7. 빌드·배포

### Vite
**프론트엔드(React 등)를 개발·빌드하는 도구**입니다.  
개발 시에는 빠른 HMR(Hot Module Replacement), 빌드 시에는 번들링·최적화를 해 줍니다.  
`npm run dev` → 개발 서버, `npm run build` → `dist/` 에 결과물 생성.

### 빌드 (Build)
**소스 코드를 배포용 파일(HTML, CSS, JS 번들)로 변환하는 과정**입니다.  
TypeScript → JavaScript, import → 하나의 파일로 합치기, 압축 등이 포함됩니다.

### dist
**빌드 결과물이 출력되는 폴더 이름**입니다.  
Vite 는 기본적으로 프로젝트 루트의 `dist/` 에 `index.html` 과 JS/CSS 파일을 만듭니다.  
이 프로젝트의 백엔드는 이 `dist/` 를 정적 파일로 서빙합니다.

### Docker
**앱과 그 실행 환경(Node 버전, 파일 구조 등)을 "이미지"로 묶어서, 어디서나 같은 방식으로 실행하게 하는 도구**입니다.  
이미지를 실행한 것이 "컨테이너"입니다.

### Dockerfile
**Docker 이미지를 어떻게 만들지 적어 둔 설정 파일**입니다.  
어떤 기본 이미지(Node 22)를 쓰고, 어떤 파일을 복사하고, 어떤 명령을 실행할지 단계별로 씁니다.

### 멀티스테이지 빌드
**이미지를 만드는 과정을 여러 단계(Stage)로 나누는 것**입니다.  
예: 1단계에서 npm install·빌드까지 하고, 2단계에서는 "필요한 결과물만" 복사해서 최종 이미지를 만듦.  
그래서 최종 이미지에는 소스 코드나 개발 의존성이 없어 용량이 줄어듭니다.

### EXPOSE
Dockerfile 의 `EXPOSE 3000` 은 **"이 이미지는 3000 포트를 사용한다"**고 문서적으로 표시하는 것입니다.  
실제로 포트를 열려면 `docker run -p 3000:3000 ...` 처럼 호스트와 연결해 줘야 합니다.

---

## 8. 기타

### __dirname
**현재 실행 중인 스크립트 파일이 있는 디렉터리 경로**입니다.  
Node.js 에서 `path.join(__dirname, 'dist')` 하면 "그 스크립트가 있는 폴더/dist" 가 됩니다.

### axios
**Node/브라우저에서 HTTP 요청을 보내기 위한 라이브러리**입니다.  
Promise 기반이고, 스트리밍 응답(responseType: 'stream')도 지원합니다.

### 폴백 (Fallback)
**원래 하려던 방법이 실패했을 때 쓰는 대안**입니다.  
예: `index.html` 이 없으면 `placeholder.html` 로 폴백한다.

### 주입 (Injection)
**원본 데이터(여기서는 index.html)에 코드나 스크립트 태그를 끼워 넣는 것**입니다.  
이 프로젝트에서는 API 키가 있을 때 `<head>` 안에 Service Worker·WebSocket 인터셉터 스크립트를 주입합니다.

---

이 문서는 프로젝트의 `README.md`, `server/server.js`, `server/public/*.js`, `vite.config.ts`, `Dockerfile` 등에 등장하는 용어를 기준으로 정리했습니다.  
추가로 궁금한 용어가 있으면 팀에 물어보거나, [MDN](https://developer.mozilla.org/ko/) 등에서 검색해 보세요.
