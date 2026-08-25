import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 웹 코드베이스가 아닌 네이티브/래퍼 프로젝트 (Xcode SourcePackages 체크아웃 등 ~75k 문제 유발)
    "upnext-ios/**",
    "ios-app/**",
    "android-twa/**",
  ]),
]);

export default eslintConfig;
