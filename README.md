# kepp.terminal — portfolio + study timer

임베디드 엔지니어 취업용 **레트로 CRT 터미널 대시보드**.
정적 HTML/CSS/JS 만으로 동작하며, GitHub Pages 에 바로 올릴 수 있습니다.
포트폴리오 탭과 **공부 타이머 탭** 두 개의 탭으로 구성되어 있고,
**아이패드 사파리**에서도 풀 기능으로 동작합니다.

---

## 📁 파일 구성

```
.
├── index.html     # 전체 레이아웃 (탭 구조, 모든 섹션 자리)
├── style.css      # CRT 테마 + 2열 타이머 레이아웃 + iPad 튜닝
├── script.js      # 데이터 로드, 렌더링, 타이머 로직, ICS/CSV 내보내기
├── data.json      # ⭐ 콘텐츠 (수정은 거의 여기서만)
└── README.md      # 이 파일
```

---

## 🚀 GitHub Pages 배포

### 사용자 사이트 (추천)

1. `keplerisgone.github.io` 이름의 **public** 저장소 생성
2. 이 폴더 전체를 저장소 루트에 push
   ```bash
   git init
   git add .
   git commit -m "init: kepp.terminal portfolio + timer"
   git branch -M main
   git remote add origin https://github.com/keplerisgone/keplerisgone.github.io.git
   git push -u origin main
   ```
3. Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/ (root)` → Save
4. 1~2분 뒤 `https://keplerisgone.github.io/` 접속

### 로컬 미리보기

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

`file://` 로 직접 열면 `data.json` fetch 가 차단됩니다. 반드시 로컬 서버로 여세요.

---

## 📱 아이패드에서 사용하기

1. 아이패드 사파리로 배포 URL (예: `https://keplerisgone.github.io/`) 접속
2. 공유 아이콘 → **홈 화면에 추가** (Add to Home Screen)
3. 홈 화면에 생긴 아이콘을 탭하면 **상태 표시줄이 통합된 풀스크린 앱처럼** 실행됩니다.
4. 가로 모드 (1024px 이상)에서 타이머 탭이 **2단 레이아웃** (현재 세션·주간 통계 / 세션 목록·내보내기)으로 펼쳐집니다.

### 데이터는 어디 저장되나요?

- 타이머 세션 기록은 **브라우저 `localStorage`** 에 저장됩니다.
  - 기기/브라우저마다 별도로 저장됩니다 (아이패드 사파리 ↔ 맥 사파리 공유 안 됨).
  - 사파리 쿠키/사이트 데이터를 지우면 사라지니 주의.
- 실행 중인 세션도 `localStorage` 에 들어 있어, 탭을 닫거나 기기가 꺼져도 **시작 시간이 보존**됩니다.

### 캘린더 연동

- 타이머 탭 → `[ .ics 내보내기 ]` → 이번 주 세션이 `.ics` 파일로 다운로드됩니다.
- 아이패드에서 파일 탭 → Calendar 앱으로 열기 → 이벤트들이 캘린더에 일괄 추가됩니다.
- 내보낸 세션은 `exported` 로 플래그가 찍혀, 재내보내기에서 자동으로 제외됩니다 (원하면 토글로 포함 가능).
- `[ .csv 내보내기 ]` 는 주간 학습 기록을 스프레드시트로 보관할 때 사용.

---

## ✏️ 콘텐츠 수정 (data.json)

### `header` — 헤더 + 부팅 로그
```json
"header": {
  "handle":   "kepp",
  "title":    "KEPP.TERMINAL",
  "subtitle": "embedded systems // junior engineer portfolio",
  "boot":     [ "[boot] ...", "[ok]  ...", ... ]
}
```
`boot` 배열은 타이핑 애니메이션으로 순서대로 표시됩니다.

### `about` — 자기소개 (3줄)
```json
"about": {
  "role":     "Embedded Systems Engineer (Junior)",
  "location": "연세대학교 전기전자공학부",
  "summary":  "한 단락 자기소개..."
}
```

### `skills` — 기술 스택 (그룹별, ASCII 진행률 바)
```json
{ "group": "Languages", "name": "C / C++", "level": 60 }
```
- `group` 으로 묶어서 표시됩니다 (`Languages`, `Platform`, `OS`, `Tools`, ...).
- `level` 은 0~100. **전적으로 주관적 추정치**이니 본인 감각에 맞게 조정하세요.

### `projects` — **[CORE 01] 작업물**
```json
{
  "id":          "robot-arm-control",
  "title":       "유격 없는 기어박스 및 3-DOF 로봇팔 제어",
  "period":      "2026.01 - 2026.06",
  "tags":        ["C++", "Arduino Uno", "PlatformIO", "PID"],
  "status":      "in-progress",               // done / in-progress / planned
  "description": "...",
  "github":      "github.com/keplerisgone/MotorControl",
  "demo":        ""
}
```

### `certifications` — **[CORE 02] 자격증**
```json
{
  "name":   "리눅스마스터 2급",
  "issuer": "한국정보통신진흥협회 (KAIT)",
  "status": "done",                 // done / in-progress / planned
  "date":   "2025.03.28",           // DONE 인 경우
  "target": "2026.05 필기 예정",    // IN_PROGRESS / PLANNED 인 경우
  "note":   "선택 메모"
}
```

### `learning` — **[CORE 03] 학습 상황**
```json
{
  "topic":    "STM32 HAL",
  "category": "MCU",
  "status":   "planned",    // done / in-progress / ongoing / planned
  "progress": 40,           // in-progress 일 때만 사용 (0~100)
  "note":     "한 줄 메모"
}
```
상태별 렌더 규칙:
- `done` → `[DONE]` 뱃지만
- `in-progress` → `[IN PROGRESS]` 뱃지 + ASCII 진행률 바
- `ongoing` → `[ONGOING]` 뱃지 + `[ ∞ ongoing ∞ ]` 표시 (끝이 없는 지속 학습, 예: 알고리즘 문제 풀이)
- `planned` → `[PLANNED]` 뱃지만

### `contact` — 연락처 슬롯
```json
"contact": {
  "email":    "keplerisgone@gmail.com",
  "github":   "github.com/keplerisgone",
  "site":     "keplerisgone.github.io",
  "blog":     "",     // 비워두면 "[ 추후 추가 예정 ]" 으로 표시
  "linkedin": "",
  "x":        "",
  "resume":   ""      // 이력서 PDF URL
}
```

### `timer.projectTags` — 타이머 프로젝트 추천값
```json
"timer": {
  "projectTags": []
}
```
- 기본값은 **빈 배열**. 타이머에서 실제로 `START` 를 눌러 사용한 프로젝트명만 자동완성 목록에 누적됩니다.
- 특정 프로젝트명을 미리 세팅해두고 싶으면 이 배열에 문자열로 추가하세요. 예: `["STM32 HAL", "알고리즘 문제 풀이"]`.
- `projects` / `learning` 항목은 **자동으로 포함되지 않습니다** — 타이머는 포트폴리오 콘텐츠와 독립적으로 관리됩니다.

---

## ⏱ 타이머 사용법

1. 상단 탭에서 `[TIMER]` 클릭
2. `project` 입력 (필수) + `memo` 입력 (선택) → `[ START ]`
3. 공부/작업 끝나면 `[ STOP ]`
4. 오른쪽 세션 목록에서 **편집/삭제** 가능
5. 주간 ASCII 바 차트로 프로젝트별 총 시간 확인
6. `[ .ics 내보내기 ]` 로 캘린더에 주간 기록 일괄 추가

단축키 팁: 프로젝트/메모 칸에서 `Enter` 를 누르면 바로 START.

---

## 🎨 테마 커스터마이징

`style.css` 상단의 CSS 변수:
```css
:root{
  --fg:        #33ff66;   /* 메인 녹색 */
  --amber:     #ffb000;   /* 액센트 */
  --bg:        #050805;
  ...
}
```

앰버 모노크롬으로 바꾸려면:
```css
--fg: #ffb000; --fg-2: #ffd36b; --fg-dim: #8a5f00;
```

CRT 깜빡임/스캔라인을 끄려면 `.crt-flicker`, `.scanlines` 요소를 HTML 에서 제거하거나 CSS 에서 `display:none` 처리하면 됩니다.

---

## ❓ FAQ

**Q. iPad 에서 START 를 누르고 화면을 끄면 타이머가 멈추나요?**
A. 벽 시계 기준 (`Date.now()`) 으로 경과 시간을 계산하기 때문에, 탭을 다시 열면 경과 시간이 정확히 복원됩니다. 다만 사파리가 메모리 압력으로 탭을 내려도 세션 정보가 `localStorage` 에 있어서 복구됩니다.

**Q. 여러 기기에서 타이머 기록이 동기화되나요?**
A. 아니요. 기기별 `localStorage` 라 공유되지 않습니다. 필요하면 주기적으로 `.csv` 내보내기로 백업하세요.

**Q. 이미 내보낸 세션을 다시 내보내고 싶어요.**
A. 내보내기 영역의 "이미 내보낸 세션 포함" 체크박스를 켜세요.

**Q. 데이터 초기화하려면?**
A. 브라우저 개발자 도구에서 `localStorage.clear()` 실행, 또는 Safari 설정 → 사이트 데이터 삭제.
