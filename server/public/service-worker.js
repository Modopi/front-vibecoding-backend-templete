/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// =============================================================================
// Service Worker — Gemini API 요청을 우리 서버의 /api-proxy 로 우회
// =============================================================================
// 이 스크립트는 브라우저의 "백그라운드 스크립트"로 동작합니다.
// 페이지가 generativelanguage.googleapis.com 으로 fetch 요청을 보내면,
// 그 요청을 가로채서 같은 사이트의 /api-proxy/... 로 보내 줍니다.
// 그래서 API 키를 브라우저에 넣지 않고도, 서버가 대신 키를 붙여서 Gemini 를 호출할 수 있습니다.

// 가로챌 대상 URL 접두어 (Google Gemini API 주소)
const TARGET_URL_PREFIX = 'https://generativelanguage.googleapis.com';

// -----------------------------------------------------------------------------
// install 이벤트: Service Worker 가 처음 설치될 때 한 번 실행됨
// -----------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  try {
    console.log('Service Worker: Installing...');
    // skipWaiting() → 대기 중인 새 SW 를 즉시 활성화시킴 (페이지 새로고침 없이)
    event.waitUntil(self.skipWaiting());
  } catch (error) {
    console.error('Service Worker: Error during install event:', error);
  }
});

// -----------------------------------------------------------------------------
// activate 이벤트: Service Worker 가 활성화되어 이제 페이지를 "제어"할 때
// -----------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  try {
    console.log('Service Worker: Activating...');
    // clients.claim() → 열려 있는 모든 페이지를 즉시 이 SW 가 제어하도록 함
    event.waitUntil(self.clients.claim());
  } catch (error) {
    console.error('Service Worker: Error during activate event:', error);
  }
});

// -----------------------------------------------------------------------------
// fetch 이벤트: 페이지나 스크립트가 네트워크 요청을 할 때마다 호출됨
// -----------------------------------------------------------------------------
// 여기서 "Gemini 로 가는 요청"만 골라서 우리 서버의 /api-proxy 로 바꿔 보냅니다.
self.addEventListener('fetch', (event) => {
  try {
    const requestUrl = event.request.url;

    if (requestUrl.startsWith(TARGET_URL_PREFIX)) {
      console.log(`Service Worker: Intercepting request to ${requestUrl}`);

      // 예: https://generativelanguage.googleapis.com/v1beta/... → /v1beta/...
      const remainingPathAndQuery = requestUrl.substring(TARGET_URL_PREFIX.length);
      // 우리 사이트 주소 + /api-proxy + 나머지 경로/쿼리
      const proxyUrl = `${self.location.origin}/api-proxy${remainingPathAndQuery}`;

      console.log(`Service Worker: Proxying to ${proxyUrl}`);

      // 프록시로 보낼 때 필요한 헤더만 복사 (원본 요청의 헤더 대부분 유지)
      const newHeaders = new Headers();
      const headersToCopy = [
        'Content-Type',
        'Accept',
        'Access-Control-Request-Method',   // CORS preflight 시 브라우저가 보내는 헤더
        'Access-Control-Request-Headers',
      ];

      for (const headerName of headersToCopy) {
        if (event.request.headers.has(headerName)) {
          newHeaders.set(headerName, event.request.headers.get(headerName));
        }
      }

      // POST 요청인데 Content-Type 이 없으면 기본값으로 application/json 설정
      if (event.request.method === 'POST') {
        if (!newHeaders.has('Content-Type')) {
          console.warn("Service Worker: POST request to proxy was missing Content-Type in newHeaders. Defaulting to application/json.");
          newHeaders.set('Content-Type', 'application/json');
        } else {
          console.log(`Service Worker: POST request to proxy has Content-Type: ${newHeaders.get('Content-Type')}`);
        }
      }

      const requestOptions = {
        method: event.request.method,
        headers: newHeaders,
        body: event.request.body,   // 원본 요청의 본문(스트림) 그대로 전달
        mode: event.request.mode,
        credentials: event.request.credentials,
        cache: event.request.cache,
        redirect: event.request.redirect,
        referrer: event.request.referrer,
        integrity: event.request.integrity,
      };

      // 스트림 본문을 보낼 때 일부 환경에서는 duplex: 'half' 가 필요함
      if (event.request.method !== 'GET' && event.request.method !== 'HEAD' && event.request.body) {
        requestOptions.duplex = 'half';
      }

      const promise = fetch(new Request(proxyUrl, requestOptions))
        .then((response) => {
          console.log(`Service Worker: Successfully proxied request to ${proxyUrl}, Status: ${response.status}`);
          return response;
        })
        .catch((error) => {
          console.error(`Service Worker: Error proxying request to ${proxyUrl}. Message: ${error.message}, Name: ${error.name}, Stack: ${error.stack}`);
          return new Response(
            JSON.stringify({ error: 'Proxying failed', details: error.message, name: error.name, proxiedUrl: proxyUrl }),
            {
              status: 502,   // Bad Gateway: 프록시가 뒤쪽 서버에서 응답을 제대로 못 받았을 때
              headers: { 'Content-Type': 'application/json' }
            }
          );
        });

      event.respondWith(promise);

    } else {
      // Gemini 가 아닌 다른 URL 로의 요청은 그대로 통과시킴
      event.respondWith(fetch(event.request));
    }
  } catch (error) {
    console.error('Service Worker: Unhandled error in fetch event handler. Message:', error.message, 'Name:', error.name, 'Stack:', error.stack);
    event.respondWith(
      new Response(
        JSON.stringify({ error: 'Service worker fetch handler failed', details: error.message, name: error.name }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );
  }
});
