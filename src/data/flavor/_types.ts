/**
 * Up Hero — flavor 데이터 공용 타입.
 * 각 던전별 파일이 같은 shape 의 이벤트 배열을 export 한다.
 */

import type { ChoiceOption } from "@/types/uphero";

export interface DungeonEvent {
  prompt: string;
  options: ChoiceOption[];
}
