/**
 * 좌석 연결 상태 (아키텍처 §8, 룰북 §17).
 *
 * Display에만 좌석별로 나가고 표기는 "연결 끊김"으로 통일한다.
 * 봇 대행 여부(`botTakeover`)는 Display에 보내지 않는다 — 표기가 갈리면 "봇 대행"이 드러난다.
 * 봇 좌석과 아직 아무도 고르지 않은 좌석은 끊길 사람이 없으므로 항상 `connected`다.
 */
export const SEAT_CONNECTION = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as const

export type SeatConnection = (typeof SEAT_CONNECTION)[keyof typeof SEAT_CONNECTION]
