/**
 * WebSocket 인터셉터 (Interceptor)
 * ==========================================
 * 브라우저에서 "Gemini 서버로 연결하는" WebSocket 을 만들 때,
 * 자동으로 우리 서버의 /api-proxy 경로로 연결이 가도록 바꿔 줍니다.
 * 그래서 프론트엔드 코드는 그대로 wss://generativelanguage.googleapis.com/...
 * 을 사용해도, 실제로는 같은 도메인의 /api-proxy/... 로 연결되고,
 * 서버가 그곳에서 API 키를 붙여서 Gemini 와 연결해 줍니다.
 */

(function() {
  // 이 호스트로 연결하려는 WebSocket 만 우리 프록시로 돌림
  const TARGET_WS_HOST = 'generativelanguage.googleapis.com';
  // 원본 WebSocket 생성자 (나중에 Proxy 로 감쌀 것)
  const originalWebSocket = window.WebSocket;

  if (!originalWebSocket) {
    console.error('[WebSocketInterceptor] Original window.WebSocket not found. Cannot apply interceptor.');
    return;
  }

  // Proxy 의 "트랩" 객체: new WebSocket(url) 할 때 construct 가 호출됨
  const handler = {
    /**
     * new WebSocket(url, protocols) 가 호출될 때 실행됨.
     * url 이 Gemini 호스트면, url 을 우리 서버의 /api-proxy URL 로 바꿔서
     * 원본 WebSocket 생성자에 넘깁니다.
     */
    construct(target, args) {
      let [url, protocols] = args;
      // url 이 문자열이 아니면 (예: URL 객체) 문자열로 바꿀 수 있으면 바꿈
      let newUrlString = typeof url === 'string' ? url : (url && typeof url.toString === 'function' ? url.toString() : null);
      let isTarget = false;

      if (newUrlString) {
        try {
          if (newUrlString.startsWith('ws://') || newUrlString.startsWith('wss://')) {
            const parsedUrl = new URL(newUrlString);
            if (parsedUrl.host === TARGET_WS_HOST) {
              isTarget = true;
              // 현재 페이지가 https 면 wss, http 면 ws 로 프록시에 연결
              const proxyScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
              const proxyHost = window.location.host;
              // 예: wss://generativelanguage.googleapis.com/v1beta/... → wss://우리호스트/api-proxy/v1beta/...
              newUrlString = `${proxyScheme}://${proxyHost}/api-proxy${parsedUrl.pathname}${parsedUrl.search}`;
            }
          }
        } catch (e) {
          console.warn('[WebSocketInterceptor-Proxy] Error parsing WebSocket URL, using original:', url, e);
        }
      } else {
        console.warn('[WebSocketInterceptor-Proxy] WebSocket URL is not a string or stringifiable. Using original.');
      }

      if (isTarget) {
        console.log('[WebSocketInterceptor-Proxy] Original WebSocket URL:', url);
        console.log('[WebSocketInterceptor-Proxy] Redirecting to proxy URL:', newUrlString);
      }

      // 원본 생성자를 호출하되, URL 만 바뀐 인자로 호출 (프로토타입 체인 유지)
      if (protocols) {
        return Reflect.construct(target, [newUrlString, protocols]);
      } else {
        return Reflect.construct(target, [newUrlString]);
      }
    },
    /**
     * WebSocket.OPEN, WebSocket.CONNECTING 같은 정적 속성이나 prototype 접근은
     * 원본 WebSocket 쪽으로 그대로 넘김
     */
    get(target, prop, receiver) {
      if (prop === 'prototype') {
        return target.prototype;
      }
      return Reflect.get(target, prop, receiver);
    }
  };

  // 전역 WebSocket 을 Proxy 로 감싼 버전으로 교체 (페이지 스크립트가 new WebSocket() 하면 이게 사용됨)
  window.WebSocket = new Proxy(originalWebSocket, handler);

  console.log('[WebSocketInterceptor-Proxy] Global WebSocket constructor has been wrapped using Proxy.');
})();
