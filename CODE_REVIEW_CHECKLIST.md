# 코드 리뷰 및 구현 품질 체크리스트

> 매번 코드 구현 시 이 체크리스트를 확인하여 실수를 방지하세요.

---

## 1. Android 네이티브 코드 수정 시

### 1.1 MainActivity.java 수정

- [ ] **`super.onCreate(savedInstanceState)`는 한 번만 호출**
  - ❌ 실수 예시:
    ```java
    super.onCreate(savedInstanceState);  // line 18
    // ...
    super.onCreate(savedInstanceState);  // line 22 ← 중복! 앱 충돌!
    ```
  - ✅ 올바른 코드:
    ```java
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);  // 한 번만 호출

        // WebView 설정 등...
        new android.os.Handler().post(() -> { ... });
    }
    ```

### 1.2 WebView 관련

- [ ] WebView 설정은 `Handler().post()` 또는 `webView.post()`로 감싸서 WebView 준비 완료 후 실행
- [ ] `getBridge()`와 `getBridge().getWebView()` null 체크 필수

---

## 2. HTML/CSS 수정 시

### 2.1 FOUC/텍스트 점프 방지

- [ ] **text-size-adjust는 인라인 CSS로 `<head>` 최상단에 배치**
  - ✅ 올바른 순서:
    ```html
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" ...>
      <style>
        html, body {
          -webkit-text-size-adjust: 100% !important;
          text-size-adjust: 100% !important;
        }
      </style>
      <!-- 그 다음 preconnect, CSS, fonts... -->
    ```
  - ❌ 피해야 할 패턴:
    - 외부 CSS 파일에만 넣기 (로드 지연으로 인한 점프)
    - `<body>` 안에 넣기 (늦은 적용)

### 2.2 외부 리소스 로딩 순서

```html
<head>
  1. <meta charset="UTF-8">
  2. <meta name="viewport" ...>
  3. <style>인라인 critical CSS</style>  ← text-size-adjust 여기
  4. <link rel="preconnect" href="https://fonts.googleapis.com">
  5. <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  6. <link rel="stylesheet" href="./styles/...css">
  7. <link href="https://fonts.googleapis.com/...">
</head>
```

---

## 3. Capacitor/Android 빌드 시

### 3.1 필수 빌드 단계

www 폴더를 수정한 후 **반드시** 실행:
```bash
cd apps/admin-app
npx cap copy android  # 또는 npx cap sync android
```

- [ ] HTML/CSS/JS 수정 후 `npx cap copy android` 실행
- [ ] MainActivity.java 수정 후 Android Studio 재빌드
- [ ] **기존 앱 삭제 후 재설치** (WebView 캐시 제거)

### 3.2 빌드 스크립트 순서

```bash
# 1. CSS 빌드 (Tailwind 등)
npm run build:admin-css

# 2. Capacitor 자산 복사
npx cap copy android

# 3. Android Studio에서 빌드 및 설치
```

---

## 4. JavaScript/TypeScript 수정 시

### 4.1 null/undefined 체크

- [ ] 모든 외부 객체 접근 전 null 체크
  ```javascript
  // ❌ 나쁨
  const value = object.property.nestedValue;

  // ✅ 좋음
  const value = object?.property?.nestedValue;
  if (object && object.property) { ... }
  ```

### 4.2 비동기 처리

- [ ] async/await 사용 시 try-catch로 에러 처리
- [ ] Promise 체이닝 시 `.catch()`로 에러 처리

---

## 5. Supabase/데이터베이스 관련

### 5.1 쿼리 안전성

- [ ] 사용자 입력을 직접 쿼리에 concatenation하지 않기 (SQL 인젝션 방지)
- [ ] RLS 정책 확인 후 배포

---

## 6. 일반적인 코딩 실수 방지

### 6.1 중복 호출 확인

- [ ] 함수가 여러 번 호출되지 않는지 확인
- [ ] 이벤트 리스너 중복 등록 방지
- [ ] `super.method()` 호출은 한 번만

### 6.2 변수명 혼동 방지

- [ ] 유사한 변수명 사용 시 주의 (webView vs webView1 등)
- [ ] 카멜케이스/스네이크케이스 일관성 유지

---

## 7. 테스트 체크리스트

### 7.1 기능 테스트

- [ ] 콜드 스타트 (앱 완전 종료 후 재실행)
- [ ] 오프라인 상태에서의 동작
- [ ] 네트워크 느린 상태에서의 동작
- [ ] 백그라운드/포그라운드 전환

### 7.2 UI 테스트

- [ ] 텍스트 크기 점프 없는지
- [ ] 스플래시 → 메인 화면 전환 매끄러운지
- [ ] 로딩 상태 표시 되는지

---

## 8. 배포 전 최종 체크

- [ ] **`npx cap copy android` 실행 완료**
- [ ] Android Studio 빌드 성공
- [ ] 기존 앱 삭제 후 재설치 (캐시 문제 방지)
- [ ] 실제 디바이스에서 콜드 스타트 테스트 3회 이상
- [ ] Console 에러 없는지 확인

---

## 9. 문제 발생 시 확인 목록

| 문제 증상 | 확인 포인트 |
|----------|-----------|
| 앱 충돌/종료 | `super.onCreate()` 중복, null 체크 누락 |
| 텍스트 점프 | text-size-adjust 인라인 미적용, 외부 CSS |
| 스타일 안 먹음 | `npx cap copy android` 미실행, 경로 오류 |
| 기능 동작 안 함 | JavaScript 에러, Capacitor 플러그인 누락 |

---

## 참고: 기존 문서 위치

```
c:\coding\Study-room-homepage\
├── TESTING.md                    # 승인 시스템 테스트 방법
├── CODE_REVIEW_CHECKLIST.md     # 이 파일 (코드 리뷰 체크리스트)
├── CLAUDE.md                     # 프로젝트 개요 (루트)
└── supabase/migrations/          # DB 마이그레이션 파일들
```
