/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// =============================================================================
// 1. 환경 설정 및 모듈 불러오기
// =============================================================================
// dotenv: .env 파일을 읽어 process.env에 넣어 줍니다. API 키 등을 코드에 안 넣고 관리할 수 있게 합니다.
require('dotenv').config();
const express = require('express');       // 웹 서버 프레임워크 (라우팅, 미들웨어 등)
const fs = require('fs');               // 파일 시스템 (index.html 읽기 등)
const axios = require('axios');          // HTTP 클라이언트 (Gemini API로 요청 보낼 때 사용)
const https = require('https');          // Node 내장 모듈 (현재 코드에서는 직접 사용 안 함, 참고용)
const path = require('path');            // 경로 조합 (__dirname + 'dist' 등)
const WebSocket = require('ws');         // WebSocket 서버/클라이언트 (실시간 양방향 통신)
const { URLSearchParams, URL } = require('url');  // URL 파싱 및 쿼리스트링 처리
const rateLimit = require('express-rate-limit');   // IP별 요청 횟수 제한 (과부하·악용 방지)

const app = express();
// 서버가 사용할 포트. 배포 환경에서는 보통 PORT 환경 변수로 지정합니다.
const port = process.env.PORT || 3000;
// 우리가 대신 요청을 넘겨줄 "진짜" API 주소 (Google Gemini REST API)
const externalApiBaseUrl = 'https://generativelanguage.googleapis.com';
// Gemini 실시간(스트리밍) 통신용 WebSocket 주소
const externalWsBaseUrl = 'wss://generativelanguage.googleapis.com';
// API 키는 환경 변수로만 관리. GEMINI_API_KEY 또는 API_KEY 중 하나만 있어도 동작합니다.
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

// 빌드된 프론트엔드 파일이 들어 있는 폴더 (Vite 빌드 시 dist/에 생성됨)
const staticPath = path.join(__dirname, 'dist');
// 서버가 제공하는 보조 스크립트들 (Service Worker, WebSocket 인터셉터 등)
const publicPath = path.join(__dirname, 'public');

if (!apiKey) {
    console.warn("GEMINI_API_KEY/API_KEY not set. Server will run; /api-proxy requests will return 503 until key is set.");
} else {
    console.log("API key configured (proxy will use it).");
}

// =============================================================================
// 2. Express 미들웨어 설정
// =============================================================================
// JSON 요청 본문 최대 50MB까지 허용 (이미지·큰 페이로드 대응)
app.use(express.json({ limit: '50mb' }));
// form 데이터도 50MB까지. extended: true면 중첩 객체까지 파싱합니다.
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// 프록시/로드밸런서 뒤에 있을 때 클라이언트 IP를 제대로 보려면 1로 설정 (프록시 1대 거침)
app.set('trust proxy', 1);

// =============================================================================
// 3. Rate Limiter (요청 제한)
// =============================================================================
// 같은 IP에서 짧은 시간에 너무 많은 요청을 보내는 것을 막습니다 (DDoS·악용 완화).
const proxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15분을 하나의 "기간"으로 봄
    max: 100,                   // 그 기간 동안 IP당 최대 100번만 허용
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,      // 응답 헤더에 RateLimit-* 정보 포함
    legacyHeaders: false,       // 구식 X-RateLimit-* 헤더는 사용 안 함
    handler: (req, res, next, options) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}. Path: ${req.path}`);
        res.status(options.statusCode).send(options.message);
    }
});

// /api-proxy 로 들어오는 요청에만 위 제한을 적용 (다른 경로는 제한 없음)
app.use('/api-proxy', proxyLimiter);

// =============================================================================
// 4. /api-proxy — HTTP 프록시 (Gemini REST API 대리 호출)
// =============================================================================
// 클라이언트가 /api-proxy/... 로 보낸 요청을 그대로 Gemini 서버로 넘기고, 응답을 그대로 돌려줍니다.
// 이렇게 하면 브라우저에는 우리 서버 주소만 보이고, API 키는 서버에만 있어서 안전합니다.
app.use('/api-proxy', async (req, res, next) => {
    console.log(req.ip);
    // WebSocket 연결 요청(Upgrade)이면 여기서 처리하지 않고, 아래 upgrade 이벤트에서 처리합니다.
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        return next();
    }

    // CORS preflight: 브라우저가 다른 도메인으로 요청 전에 OPTIONS로 "허용 여부"를 먼저 물어봄.
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Goog-Api-Key');
        res.setHeader('Access-Control-Max-Age', '86400');  // 24시간 동안 preflight 결과 캐시
        return res.sendStatus(200);
    }

    // API 키가 없으면 프록시 기능을 끄고, 클라이언트에게 안내 메시지를 반환합니다.
    if (!apiKey) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(503).json({
            error: 'Proxy disabled',
            message: 'GEMINI_API_KEY (or API_KEY) is not set. Set it in .env or environment to use the Gemini API proxy.',
            code: 'PROXY_NO_API_KEY'
        });
    }

    if (req.body) {
        console.log("  Request Body (from frontend):", req.body);
    }
    try {
        // 클라이언트가 /api-proxy/v1beta/... 로 보냈다면, targetPath 는 "api-proxy/v1beta/..." 형태.
        // req.url 이 "/api-proxy/v1beta/..." 이므로 앞의 "/" 제거 후 그대로 붙여서 Gemini URL 만듦.
        const targetPath = req.url.startsWith('/') ? req.url.substring(1) : req.url;
        const apiUrl = `${externalApiBaseUrl}/${targetPath}`;
        console.log(`HTTP Proxy: Forwarding request to ${apiUrl}`);

        // 나가는 요청에 넣을 헤더를 준비 (클라이언트에서 온 헤더 대부분 복사)
        const outgoingHeaders = {};
        for (const header in req.headers) {
            // host, connection 등은 우리가 보내는 요청에 맞게 바뀌어야 하므로 제외
            if (!['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions'].includes(header.toLowerCase())) {
                outgoingHeaders[header] = req.headers[header];
            }
        }

        // Gemini API 인증: API 키를 헤더에 넣어서 보냅니다 (클라이언트는 이 키를 몰라도 됨).
        outgoingHeaders['X-Goog-Api-Key'] = apiKey;

        if (req.headers['content-type'] && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
            outgoingHeaders['Content-Type'] = req.headers['content-type'];
        } else if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
            outgoingHeaders['Content-Type'] = 'application/json';
        }

        // GET/DELETE 는 보통 본문이 없으므로 Content-Type 을 안 보내는 게 맞음.
        if (['GET', 'DELETE'].includes(req.method.toUpperCase())) {
            delete outgoingHeaders['Content-Type'];
            delete outgoingHeaders['content-type'];
        }

        if (!outgoingHeaders['accept']) {
            outgoingHeaders['accept'] = '*/*';
        }

        // axios 로 Gemini 에 요청. responseType: 'stream' 이면 응답을 스트림으로 받아서
        // 청크 단위로 클라이언트에 바로 전달할 수 있습니다 (스트리밍 응답).
        const axiosConfig = {
            method: req.method,
            url: apiUrl,
            headers: outgoingHeaders,
            responseType: 'stream',
            validateStatus: function (status) {
                return true;  // 4xx, 5xx 도 그대로 클라이언트에 넘김
            },
        };

        if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
            axiosConfig.data = req.body;
        }

        const apiResponse = await axios(axiosConfig);

        // Gemini 에서 온 응답 헤더를 그대로 클라이언트에 전달
        for (const header in apiResponse.headers) {
            res.setHeader(header, apiResponse.headers[header]);
        }
        res.status(apiResponse.status);

        // 스트림: 데이터가 조금씩 도착할 때마다 클라이언트에 바로 써 줍니다.
        apiResponse.data.on('data', (chunk) => {
            res.write(chunk);
        });

        apiResponse.data.on('end', () => {
            res.end();
        });

        apiResponse.data.on('error', (err) => {
            console.error('Error during streaming data from target API:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Proxy error during streaming from target' });
            } else {
                res.end();
            }
        });

    } catch (error) {
        console.error('Proxy error before request to target API:', error);
        if (!res.headersSent) {
            if (error.response) {
                const errorData = {
                    status: error.response.status,
                    message: error.response.data?.error?.message || 'Proxy error from upstream API',
                    details: error.response.data?.error?.details || null
                };
                res.status(error.response.status).json(errorData);
            } else {
                res.status(500).json({ error: 'Proxy setup error', message: error.message });
            }
        }
    }
});

// =============================================================================
// 5. HTML 주입용 스크립트 (문자열)
// =============================================================================
// API 키가 있을 때 index.html <head> 안에 넣을 스크립트 태그.
// 이 스크립트가 브라우저의 WebSocket 생성자를 감싸서, Gemini 주소로 가는 연결을 우리 /api-proxy 로 돌립니다.
const webSocketInterceptorScriptTag = `<script src="/public/websocket-interceptor.js" defer></script>`;

// Service Worker 등록 코드. 페이지 로드 후 service-worker.js 를 등록해 두면,
// 프론트에서 generativelanguage.googleapis.com 으로 가는 fetch 가 우리 /api-proxy 로 우회됩니다.
const serviceWorkerRegistrationScript = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load' , () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('Service Worker registered successfully with scope:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
} else {
  console.log('Service workers are not supported in this browser.');
}
</script>
`;

// =============================================================================
// 6. 루트 경로(/) — index.html 또는 placeholder 서빙
// =============================================================================
// 사용자가 "/" 로 접속했을 때: dist/index.html 이 있으면 그걸 보여 주고,
// API 키가 설정돼 있으면 그 HTML 의 <head> 에 위 두 스크립트를 주입합니다.
// index.html 이 없으면 placeholder.html 로 폴백합니다 (이 파일은 server/public/ 에 두면 됨).
app.get('/', (req, res) => {
    const placeholderPath = path.join(publicPath, 'placeholder.html');

    console.log("LOG: Route '/' accessed. Attempting to serve index.html.");
    const indexPath = path.join(staticPath, 'index.html');

    fs.readFile(indexPath, 'utf8', (err, indexHtmlData) => {
        if (err) {
            console.log('LOG: index.html not found or unreadable. Falling back to original placeholder.');
            return res.sendFile(placeholderPath);
        }

        if (!apiKey) {
          console.log("LOG: API key not set. Serving original index.html without script injections.");
          return res.sendFile(indexPath);
        }

        console.log("LOG: index.html read successfully. Injecting scripts.");
        let injectedHtml = indexHtmlData;

        if (injectedHtml.includes('<head>')) {
            injectedHtml = injectedHtml.replace(
                '<head>',
                `<head>${webSocketInterceptorScriptTag}${serviceWorkerRegistrationScript}`
            );
            console.log("LOG: Scripts injected into <head>.");
        } else {
            console.warn("WARNING: <head> tag not found in index.html. Prepending scripts to the beginning of the file as a fallback.");
            injectedHtml = `${webSocketInterceptorScriptTag}${serviceWorkerRegistrationScript}${indexHtmlData}`;
        }
        res.send(injectedHtml);
    });
});

// Service Worker 파일 자체는 /service-worker.js URL 로 제공 (스코프 맞추기 위해)
app.get('/service-worker.js', (req, res) => {
   return res.sendFile(path.join(publicPath, 'service-worker.js'));
});

// /public/* 경로는 server/public 폴더의 정적 파일로 서빙
app.use('/public', express.static(publicPath));
// 그 외 정적 파일은 dist 폴더에서 (JS, CSS, 이미지 등)
app.use(express.static(staticPath));

// =============================================================================
// 7. HTTP 서버 시작
// =============================================================================
const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`HTTP proxy: /api-proxy/** ${apiKey ? '(enabled)' : '(disabled — set GEMINI_API_KEY to enable)'}`);
    console.log(`WebSocket proxy: /api-proxy/** ${apiKey ? '(enabled)' : '(disabled)'}`);
});

// =============================================================================
// 8. WebSocket 프록시 (Gemini 실시간 연결 대리)
// =============================================================================
// "noServer: true" 면 우리가 직접 upgrade 이벤트를 받아서 WebSocket 을 수락합니다.
// 같은 HTTP 서버에서 /api-proxy/... 로 오는 WebSocket 연결만 처리하고, 나머지는 거절합니다.
const wss = new WebSocket.Server({ noServer: true });

// 브라우저가 HTTP 연결을 "업그레이드"해서 WebSocket 으로 바꾸려 할 때 발생하는 이벤트
server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith('/api-proxy/')) {
        if (!apiKey) {
            console.warn("WebSocket proxy: API key not set. Rejecting connection.");
            socket.destroy();
            return;
        }

        // 클라이언트와의 WebSocket 연결을 수락하고, 동시에 Gemini 쪽 WebSocket 을 하나 더 엽니다.
        // 이후 클라이언트 ↔ 우리 서버 ↔ Gemini 세 개가 터널처럼 연결됩니다.
        wss.handleUpgrade(request, socket, head, (clientWs) => {
            console.log('Client WebSocket connected to proxy for path:', pathname);

            // 클라이언트가 요청한 경로/쿼리를 그대로 Gemini 주소로 붙임. key 는 서버가 넣음.
            const targetPathSegment = pathname.substring('/api-proxy'.length);
            const clientQuery = new URLSearchParams(requestUrl.search);
            clientQuery.set('key', apiKey);
            const targetGeminiWsUrl = `${externalWsBaseUrl}${targetPathSegment}?${clientQuery.toString()}`;
            console.log(`Attempting to connect to target WebSocket: ${targetGeminiWsUrl}`);

            const geminiWs = new WebSocket(targetGeminiWsUrl, {
                protocol: request.headers['sec-websocket-protocol'],
            });

            // Gemini 연결이 열리기 전에 클라이언트가 보낸 메시지는 여기에 쌓아 두었다가
            // 연결이 열리면 순서대로 Gemini 로 보냅니다.
            const messageQueue = [];

            geminiWs.on('open', () => {
                console.log('Proxy connected to Gemini WebSocket');
                while (messageQueue.length > 0) {
                    const message = messageQueue.shift();
                    if (geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(message);
                    } else {
                        messageQueue.unshift(message);
                        break;
                    }
                }
            });

            geminiWs.on('message', (message) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(message);
                }
            });

            geminiWs.on('close', (code, reason) => {
                console.log(`Gemini WebSocket closed: ${code} ${reason.toString()}`);
                if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
                    clientWs.close(code, reason.toString());
                }
            });

            geminiWs.on('error', (error) => {
                console.error('Error on Gemini WebSocket connection:', error);
                if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
                    clientWs.close(1011, 'Upstream WebSocket error');
                }
            });

            clientWs.on('message', (message) => {
                if (geminiWs.readyState === WebSocket.OPEN) {
                    geminiWs.send(message);
                } else if (geminiWs.readyState === WebSocket.CONNECTING) {
                    messageQueue.push(message);
                } else {
                    console.warn('Client sent message but Gemini WebSocket is not open or connecting. Message dropped.');
                }
            });

            clientWs.on('close', (code, reason) => {
                console.log(`Client WebSocket closed: ${code} ${reason.toString()}`);
                if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
                    geminiWs.close(code, reason.toString());
                }
            });

            clientWs.on('error', (error) => {
                console.error('Error on client WebSocket connection:', error);
                if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
                    geminiWs.close(1011, 'Client WebSocket error');
                }
            });
        });
    } else {
        console.log(`WebSocket upgrade request for non-proxy path: ${pathname}. Closing connection.`);
        socket.destroy();
    }
});
