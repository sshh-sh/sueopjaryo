/* 수업자료용 서비스 워커 — 홈 화면 설치와 공유 버튼용. 저장(캐시)은 하지 않고 항상 인터넷에서 새로 받음 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* 그대로 통과 */ });
