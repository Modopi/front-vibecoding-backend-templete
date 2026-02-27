# =============================================================================
# Dockerfile — 이 프로젝트를 Docker 이미지로 빌드하기 위한 설정
# =============================================================================
# "멀티스테이지 빌드"를 사용합니다.
# 1단계(builder): 프론트 빌드 + 서버 의존성 설치
# 2단계: 실제로 실행할 때 필요한 파일만 복사해서 최종 이미지를 만듦 (이미지 크기 감소)

# -----------------------------------------------------------------------------
# Stage 1: 빌드 단계 (builder)
# -----------------------------------------------------------------------------
# Node.js 22 기반 이미지를 "builder" 라는 이름으로 사용
FROM node:22 AS builder

# 컨테이너 안에서 앱 코드가 들어갈 작업 디렉터리
WORKDIR /app

# 현재 디렉터리(프로젝트 루트)의 모든 파일을 /app 으로 복사
COPY . ./
# 빌드 시 .env 가 없으면 에러가 날 수 있으므로 placeholder 로 만들어 둠
RUN echo "API_KEY=PLACEHOLDER" > ./.env
RUN echo "GEMINI_API_KEY=PLACEHOLDER" >> ./.env

# 서버 쪽 의존성 설치 (server/package.json)
WORKDIR /app/server
RUN npm install

# 다시 프로젝트 루트로 와서 프론트엔드 의존성 설치 후 빌드
WORKDIR /app
RUN mkdir dist
# package.json 이 있으면 (프론트가 있으면) npm install && npm run build 실행
# 빌드 결과는 루트의 dist/ 에 생성된다고 가정 (Vite 기본값)
RUN bash -c 'if [ -f package.json ]; then npm install && npm run build; fi'


# -----------------------------------------------------------------------------
# Stage 2: 최종 실행 이미지
# -----------------------------------------------------------------------------
# 새로 Node 22 이미지를 가져옴 (builder 에 있던 node_modules 등은 안 가져옴)
FROM node:22

WORKDIR /app

# builder 단계에서 만든 server 폴더 내용만 복사 (설치된 node_modules 포함)
COPY --from=builder /app/server .
# builder 단계에서 빌드한 프론트 결과물(dist)만 복사
COPY --from=builder /app/dist ./dist

# 이 이미지로 컨테이너를 띄울 때 3000 포트를 열어 둠
EXPOSE 3000

# 컨테이너가 실행될 때 실행할 명령 (서버만 실행하면 됨; 프론트는 이미 dist 에 있음)
CMD ["node", "server.js"]
