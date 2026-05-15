//
//  UpHero.swift
//  UpNext 모델 — Up Hero (방치형 RPG) 타입 시스템.
//
//  웹 src/types/uphero.ts (1,493줄) 포팅의 시작점.
//  Phase 2.3에서는 buffDraw가 필요로 하는 DungeonId만 우선 정의.
//  나머지 RPG 타입(CombatSession, Equipment, Monster, ClassType 등)은
//  Phase 2.4 (RPG 엔진)에서 이 파일에 누적 포팅.
//

import Foundation

/// 던전 식별자. 웹 `type DungeonId = Category` — 카테고리와 1:1.
typealias DungeonId = Category
