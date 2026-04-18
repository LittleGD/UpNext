/**
 * Up Hero — flavor 데이터 공용 타입.
 * 각 던전별 파일이 같은 shape 의 이벤트 배열을 export 한다.
 *
 * Phase 12 i18n framework —
 *   이벤트 데이터는 한국어로 정의되어 있고 즉시 다국어화하기엔 범위가
 *   너무 큼 (수백 개 문자열). 대신 "점진적 번역" 프레임워크 제공:
 *     - DungeonEvent / ChoiceOption / ChoiceOutcome 의 각 문자열 필드에
 *       `*Key?: string` 선택 필드 추가
 *     - key 가 설정된 이벤트는 i18n 에서 조회, 없으면 한국어 literal 그대로
 *     - 신규 이벤트부터 key 부여 → 번역 인프라 준비 완료
 *   실제 번역은 별도 phase 에서 점진적 진행.
 */

import type { ChoiceOption } from "@/types/uphero";

export interface DungeonEvent {
  prompt: string;
  /**
   * i18n key (예: `uphero.event.fit.wolf_path`). 설정되면 현재 언어에서
   *   해당 key 를 조회해 prompt 대신 사용. 미설정이면 `prompt` 그대로.
   */
  promptKey?: string;
  options: ChoiceOption[];
}
