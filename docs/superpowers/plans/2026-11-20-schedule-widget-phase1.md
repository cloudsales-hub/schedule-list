# 일정·할일 위젯 앱 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 윈도우 바탕화면 위젯 + `Win+J` 빠른 입력창 + 대시보드 + 두 PC 동기화를 갖춘 개인용 일정·할일 앱의 1단계(화면보호기 제외)를 만든다.

**Architecture:** 날짜 해석, 정렬, 병합 같은 로직은 UI와 분리된 순수 TypeScript(`src/core`)로 만들어 리눅스에서 테스트한다. 파일 읽기·쓰기는 Tauri에 의존하지 않는 Rust 크레이트(`crates/datafile`)로 분리해 역시 리눅스에서 테스트한다. 창 3개(위젯, 빠른 입력, 대시보드)는 하나의 Tauri 앱 안에서 각각 별도 HTML 페이지로 띄운다. 윈도우 설치 파일은 GitHub Actions의 윈도우 러너로 만든다.

**Tech Stack:** Tauri 2, React + TypeScript + Vite, Vitest, Rust (`notify`, `tauri-plugin-global-shortcut`, `tauri-plugin-autostart`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`), GitHub Actions

**Spec:** `docs/superpowers/specs/2026-11-20-schedule-widget-design.md` (프로젝트 문서 `claude/일정위젯_설계문서.md`와 동일). 2단계(화면보호기, 스펙 3.5)는 이 계획의 범위가 아니며 사용자가 1단계를 써 본 뒤 별도 계획으로 만든다.

## Global Constraints

- 대상 OS는 윈도우(10/11)만이다. 모바일, 맥, 리눅스용 앱은 만들지 않는다.
- 사용자는 개발 지식이 없다. 설치는 설치 파일 더블클릭만으로 끝나야 하고, 터미널 사용을 요구하면 안 된다.
- 서버, 로그인, 외부 서비스 연동은 없다. 데이터는 로컬 JSON 파일 하나다.
- 기본 단축키는 `Win+J`(Tauri 표기 `Super+J`)이고 설정에서 바꿀 수 있다. 등록 실패 시 "이미 사용 중인 키입니다"라고 알린다. `Win+M`은 쓸 수 없다.
- 위젯은 항상 다른 창 **아래**에 있고, 위젯에는 일정(event)을 표시하지 않는다. 위젯에는 "급한 것"과 "할일"만 보인다.
- 대시보드는 달력, 오늘/임박(중요 할일), 일정, 할일 네 칸이다. "최근 완료" 카드는 없다.
- 사용자에게 보이는 글자는 모두 한국어다. 이름은 "나중에 할 일"이 아니라 **"할일"**이다.
- 위젯 오른쪽 위의 `＋ 메모` 버튼은 테두리가 있는 버튼 모양이고 안에 현재 단축키를 표시하며, 클릭하면 빠른 입력창이 열린다.
- 데이터 파일 형식은 `{ "version": 1, "items": Item[] }` 이다.
- 디자인은 어두운 노션 스타일(배경 `#191919`, 카드 `#202020`)이고, 대시보드 맨 위에 큰 배너(기본 높이 320px, 기본 그림은 Claude가 그린 도트 "한여름 시골 방" `docs/superpowers/assets/banner-room.png`)와 큰 시계가 있다. 위젯과 대시보드에 한 줄 메모 입력칸(`MemoInput`)이 있다. 포스트잇 메모지, 날씨, 빠른 추가 버튼, 목표, 우선순위·상태 열은 만들지 않는다.

## Review Focus

스펙이 암시하지만 개별 태스크 테스트가 따로 다루지 않는 입력과 상황이다. 사용 중 가장 문제가 되기 쉬운 순서이고, 각 항목의 테스트는 해당 코드를 가진 태스크 안에 들어 있다.

1. **애매하거나 이상한 메모 입력:** 빈 문자열, 공백만 있는 입력, 날짜 표현이 없는 문장, "3시"처럼 오전/오후가 없는 시각. 앱이 죽지 않고, 빈 입력은 저장되지 않으며, 날짜를 못 읽으면 마감 없는 할일이 된다. (Task 3)
2. **두 PC가 같은 파일을 거의 동시에 수정:** 어느 쪽 항목도 사라지지 않고, 같은 항목은 나중에 수정한 쪽이 이긴다. (Task 4, Task 6)
3. **데이터 파일이 없거나 비었거나 깨졌을 때:** 앱이 빈 목록으로 시작하고, 깨진 파일은 덮어쓰지 않고 백업본으로 보관한다. (Task 4, Task 5)
4. **자정이 지났을 때:** 앱을 켜 둔 채 날짜가 바뀌면 "오늘/임박"과 달력의 오늘 표시가 사용자 조작 없이 갱신된다. (Task 7)
5. **항목이 아주 많거나 한 줄이 매우 길 때:** 위젯이 화면 밖으로 넘치지 않고 스크롤되며, 긴 글은 줄여서 보인다. (Task 7)

---

## File Structure

```
schedule-app/
  package.json  vite.config.ts  tsconfig.json  widget.html  quick.html  dashboard.html
  .github/workflows/build-windows.yml
  src/core/model.ts          Item 타입, 생성·수정 함수
  src/core/selectors.ts      위젯/대시보드에 보여줄 목록 계산
  src/core/parse.ts          한국어 메모 → 종류/마감 해석
  src/core/merge.ts          파일 직렬화, 두 목록 병합, 삭제 정리
  src/core/store.ts          ItemsStore: 불러오기, 변경, 병합 후 저장 (Backend 인터페이스 위에서 동작)
  src/ui/api.ts              Tauri 명령 호출 래퍼 (Backend 구현)
  src/ui/Widget.tsx  QuickInput.tsx  Dashboard.tsx  Calendar.tsx  SettingsPanel.tsx
  src/ui/useNow.ts           현재 시각을 분 단위로 갱신하는 훅
  src/entry-widget.tsx  src/entry-quick.tsx  src/entry-dashboard.tsx
  crates/datafile/           read_text, write_atomic, backup_corrupt (Tauri 비의존)
  src-tauri/                 tauri.conf.json, capabilities, src/lib.rs (명령, 창, 트레이, 단축키, 감시)
```

---

### Task 1: 프로젝트 뼈대, 테스트 환경, 윈도우 빌드 자동화

**Files:**
- Create: 위 File Structure의 설정 파일 전체, `.gitignore`, `.github/workflows/build-windows.yml`, `src/core/smoke.test.ts`
- Modify: `docs/` 는 건드리지 않는다.

**Interfaces:**
- Produces: `npm test`(Vitest), `cargo test -p datafile`, 윈도우 설치 파일을 만드는 워크플로. 이후 모든 태스크가 이 위에서 동작한다.

- [ ] **Step 1: `git init` 후 `npm create tauri-app@latest`(템플릿 react-ts, 이름 `schedule-app`)로 뼈대를 만들고, Vite를 3페이지(`widget.html`, `quick.html`, `dashboard.html`) 다중 진입점으로 설정한다. 기본 데모 코드는 지운다.**
- [ ] **Step 2: Vitest를 추가하고 `src/core/smoke.test.ts`에 `expect(1 + 1).toBe(2)`만 둔다. `npm test`가 통과하는지 확인한다.**
  Run: `npm test` / Expected: 1 passed
- [ ] **Step 3: `crates/datafile`을 빈 크레이트로 만들고 Cargo 워크스페이스에 `src-tauri`와 함께 등록한다.**
  Run: `cargo test -p datafile` / Expected: 0 tests, 오류 없음
- [ ] **Step 4: `.github/workflows/build-windows.yml`을 작성한다.** `windows-latest`에서 `tauri-apps/tauri-action`으로 NSIS 설치 파일(`.exe`)을 빌드해 Actions 산출물로 올리고, 태그(`v*`) 푸시와 수동 실행(`workflow_dispatch`) 모두에서 돈다.
- [ ] **Step 5: 선행 조건 — 사용자가 GitHub 계정(무료)과 비공개 저장소를 만들어야 한다.** 개발 지식이 없는 사용자에게 화면별로 안내한다. 저장소가 준비되면 푸시하고 워크플로를 수동 실행한다.
  Expected: 워크플로 성공, 산출물에 설치 파일이 있다.
- [ ] **Step 6: Commit**
  ```bash
  git add -A && git commit -m "chore: scaffold tauri app, vitest, windows build workflow"
  ```

---

### Task 2: 데이터 모델과 목록 계산 (`model.ts`, `selectors.ts`)

**Files:**
- Create: `src/core/model.ts`, `src/core/selectors.ts`
- Test: `src/core/selectors.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ItemKind = 'event' | 'task';
  interface Item { id: string; text: string; kind: ItemKind;
    due: string | null;      // 'YYYY-MM-DDTHH:mm' (로컬 시각). 날짜만 있으면 'YYYY-MM-DDT00:00'
    hasTime: boolean; done: boolean; deleted: boolean;
    createdAt: number; updatedAt: number; }          // epoch ms
  function createItem(p: { text: string; kind: ItemKind; due: string|null; hasTime: boolean }, now: Date): Item
  function updateItem(it: Item, patch: Partial<Pick<Item,'text'|'kind'|'due'|'hasTime'|'done'|'deleted'>>, now: Date): Item  // updatedAt 갱신
  function urgentTasks(items: Item[], now: Date): Item[]      // 마감 있는 할일, 마감 빠른 순, 지난 것 포함
  function soonTasks(items: Item[], now: Date): Item[]        // urgentTasks 중 마감이 (오늘 + 7일) 끝 이전
  function plainTodos(items: Item[]): Item[]                  // 마감 없는 할일, createdAt 오래된 순
  function upcomingEvents(items: Item[], now: Date, limit?: number): Item[]  // 오늘 0시 이후 일정, 빠른 순
  function markedDays(items: Item[], year: number, month: number): Set<number> // 일정/마감이 있는 날(일)
  ```
  모든 선택 함수는 `done`이거나 `deleted`인 항목을 제외한다.
- 일정/할일 구분, 임박 7일, 오래된 순 정렬은 스펙 4절의 Claude 판단이다.

- [ ] **Step 1: `selectors.test.ts`를 작성한다.** 기준 시각 `now = new Date('2026-11-20T09:00')`.
  - `urgentTasks`: 마감 `2026-11-21T12:00`, `2026-11-20T17:00`, 마감 없음 3개를 넣으면 `['…11-20T17:00','…11-21T12:00']` 순으로 나오고 마감 없는 것과 `kind:'event'`는 빠진다.
  - `soonTasks`: `2026-11-27T00:00`은 포함, `2026-11-28T00:00`은 제외.
  - `plainTodos`: `createdAt` 1, 2, 3 순서로 나온다. 완료된 것은 빠진다.
  - `upcomingEvents`: 어제 일정은 빠지고 오늘 `16:30`, `2026-11-24T10:00` 순으로 나온다. `limit=1`이면 1개.
  - `markedDays(items, 2026, 11)`: 일정 11/24와 마감 11/27이 있으면 `{24, 27}`. 삭제된 항목의 날짜는 빠진다.
- [ ] **Step 2: 실행해서 실패(함수 없음)를 확인한다.** Run: `npx vitest run src/core/selectors.test.ts`
- [ ] **Step 3: `model.ts`, `selectors.ts`를 위 시그니처대로 구현한다.** `id`는 `crypto.randomUUID()`.
- [ ] **Step 4: 실행해서 통과를 확인한다.** Expected: 전부 PASS
- [ ] **Step 5: Commit** `git add src/core && git commit -m "feat: item model and list selectors"`

---

### Task 3: 한국어 메모 해석 (`parse.ts`)

**Files:**
- Create: `src/core/parse.ts`
- Test: `src/core/parse.test.ts`

**Interfaces:**
- Consumes: `ItemKind`
- Produces:
  ```ts
  interface ParsedMemo { text: string; kind: ItemKind; due: string|null; hasTime: boolean; label: string|null } // label: 미리보기용 "내일(11/21) 오전"
  function parseMemo(input: string, now: Date): ParsedMemo | null   // 빈 입력/공백만이면 null
  ```
- 규칙(스펙 3.1, 4절): `text`는 입력 그대로(앞뒤 공백만 제거). 날짜 표현 → 오늘, 내일, 모레, 다음 주 `요일`, `N월 N일`, `이번 주 요일`. 시각 표현 → `오전/오후 N시`, `N시 M분`, `HH:MM`, `17시`. 시각이 있고 "까지/마감"이 없으면 **event**. 날짜만 있거나 "까지/마감"이 붙으면 **task**(마감). `오전까지`는 12:00, `오후까지`는 18:00, 시각 없는 날짜는 `T00:00`·`hasTime:false`. 오전/오후 없이 `1~6시`는 오후, `7~11시`는 오전, `12시`는 낮 12시(Claude의 판단). 날짜 표현이 전혀 없으면 `kind:'task'`, `due:null`.

- [ ] **Step 1: `parse.test.ts`를 작성한다.** `now = new Date('2026-11-20T09:00')` (금요일).
  - `'김과장 견적서 다시 확인 — 내일 오전까지'` → `kind:'task'`, `due:'2026-11-21T12:00'`, `hasTime:true`, `label:'내일(11/21) 오전'`
  - `'내일 3시 회의'` → `kind:'event'`, `due:'2026-11-21T15:00'`
  - `'모레 오전 10시 거래처 통화'` → `event`, `'2026-11-22T10:00'`
  - `'다음 주 수요일 보고서 제출'` → `task`, `due:'2026-11-25T00:00'`, `hasTime:false`
  - `'오늘 17시까지 견적서'` → `task`, `due:'2026-11-20T17:00'`
  - `'박팀장님 요청 자료 나중에 찾아보기'` → `task`, `due:null`, `label:null`
  - `'11월 27일 정산 자료'` → `task`, `'2026-11-27T00:00'`
  - **(Review Focus 1)** `''`, `'   '` → `null`. `'3시'`만 → `event`, `15:00`. `'25시 회의'`처럼 불가능한 시각은 시각을 무시하고 `task`, `due:null`. `'내일모레'`처럼 못 읽는 표현은 예외 없이 `task`, `due:null`.
- [ ] **Step 2: 실행해서 실패를 확인한다.** Run: `npx vitest run src/core/parse.test.ts`
- [ ] **Step 3: `parseMemo`를 구현한다.** 정규식 기반이면 충분하다. 해석에 실패한 부분은 무시하고 예외를 던지지 않는다. 한국어 표현은 한 곳(상수 표)에 모은다.
- [ ] **Step 4: 실행해서 통과를 확인한다.** Expected: 전부 PASS
- [ ] **Step 5: Commit** `git add src/core && git commit -m "feat: korean memo parser"`

---

### Task 4: 직렬화와 병합 (`merge.ts`)

**Files:**
- Create: `src/core/merge.ts`
- Test: `src/core/merge.test.ts`

**Interfaces:**
- Consumes: `Item`
- Produces:
  ```ts
  interface DataFile { version: 1; items: Item[] }
  type LoadResult = { ok: true; data: DataFile } | { ok: false; reason: 'empty' | 'corrupt' }
  function parseDataFile(text: string | null): LoadResult   // null/공백 → empty, 형식 오류 → corrupt
  function serializeDataFile(items: Item[]): string          // JSON, 들여쓰기 2칸
  function mergeItems(a: Item[], b: Item[]): Item[]          // id 기준 합집합, updatedAt 큰 쪽, 같으면 deleted:true 쪽, 그래도 같으면 a
  function purgeDeleted(items: Item[], now: Date, days?: number): Item[]  // deleted 이면서 updatedAt이 days(기본 30)일 넘은 것 제거
  ```

- [ ] **Step 1: `merge.test.ts`를 작성한다.**
  - **(Review Focus 2)** 한쪽에만 있는 항목은 모두 남는다. 같은 id에서 `updatedAt`이 큰 쪽이 이긴다. 같은 시각이면 `deleted:true`인 쪽이 이긴다. `mergeItems(a,b)`와 `mergeItems(b,a)` 결과의 id 집합이 같다.
  - `purgeDeleted`: 31일 전 삭제 항목은 제거, 29일 전 삭제 항목과 삭제 안 된 오래된 항목은 유지.
  - **(Review Focus 3)** `parseDataFile(null)`, `parseDataFile('  ')` → `{ok:false, reason:'empty'}`. `parseDataFile('{깨짐')`, `parseDataFile('{"version":2}')` → `reason:'corrupt'`. 직렬화 후 다시 파싱하면 같은 items.
- [ ] **Step 2: 실행해서 실패를 확인한다.** Run: `npx vitest run src/core/merge.test.ts`
- [ ] **Step 3: 위 시그니처대로 구현한다.**
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: Commit** `git add src/core && git commit -m "feat: data file serialization and merge"`

---

### Task 5: 데이터 파일 크레이트와 Tauri 백엔드 명령

**Files:**
- Create: `crates/datafile/src/lib.rs`, `src-tauri/src/lib.rs`(명령·감시), `src-tauri/capabilities/*.json`
- Test: `crates/datafile/src/lib.rs` 안의 `#[cfg(test)]`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`

**Interfaces:**
- Produces (Rust, `datafile`):
  ```rust
  pub fn read_text(path: &Path) -> io::Result<Option<String>>;       // 파일 없으면 Ok(None)
  pub fn write_atomic(path: &Path, text: &str) -> io::Result<()>;    // 임시 파일에 쓰고 이름 바꾸기
  pub fn backup_corrupt(path: &Path) -> io::Result<PathBuf>;         // data.corrupt-<unix초>.json 으로 이름 변경
  ```
- Produces (Tauri 명령, 프런트가 `invoke`로 호출):
  `read_data() -> Option<String>`, `write_data(text: String) -> ()`, `backup_corrupt_data() -> String`,
  `get_settings() -> Settings`, `save_settings(s: Settings) -> ()`,
  `Settings { hotkey: String /* 기본 "Super+J" */, dataDir: Option<String>, autostart: bool, bannerPath: Option<String> /* 비우면 기본 그림 */, bannerHeight: u32 /* 160|240|320, 기본 320 */ }` (앱 설정 폴더의 `settings.json`, 동기화 대상 아님).
  이벤트: `data-changed`(데이터 파일이 외부에서 바뀜), `hotkey-failed { key: string }`(Task 8이 사용).
- 데이터 파일 위치: `<dataDir>/schedule-data.json`. `dataDir`이 비어 있으면 `%USERPROFILE%\OneDrive\일정위젯`(폴더가 있을 때) 아니면 앱 데이터 폴더.

- [ ] **Step 1: `datafile`의 테스트를 작성한다.** (임시 폴더 사용)
  - 없는 파일 `read_text` → `Ok(None)`. `write_atomic` 후 `read_text` → 같은 문자열. 한글이 포함돼도 동일.
  - `write_atomic`은 같은 폴더에 `.tmp`가 남지 않는다.
  - **(Review Focus 3)** `backup_corrupt`는 원본을 지우지 않고 이름만 바꿔 내용이 보존되며, 원래 경로는 사라진다.
- [ ] **Step 2: `cargo test -p datafile`로 실패를 확인한다.**
- [ ] **Step 3: 위 세 함수를 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** Run: `cargo test -p datafile` / Expected: 전부 ok
- [ ] **Step 5: `src-tauri/src/lib.rs`에 위 Tauri 명령과 `notify` 감시를 구현한다.** 감시는 데이터 파일이 바뀌면 `data-changed`를 내보내고, 앱 자신이 쓴 직후의 이벤트는 파일 내용이 마지막으로 쓴 내용과 같으면 무시한다. `tauri-plugin-single-instance`로 앱이 두 번 뜨지 않게 한다.
- [ ] **Step 6: 리눅스에서 `cargo check -p datafile`이 통과하는지, 윈도우 빌드(워크플로)가 통과하는지 확인한다.**
- [ ] **Step 7: Commit** `git add -A && git commit -m "feat: datafile crate and tauri data/settings commands"`

---

### Task 6: ItemsStore (불러오기, 변경, 병합 후 저장)

**Files:**
- Create: `src/core/store.ts`, `src/ui/api.ts`
- Test: `src/core/store.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Item`, `createItem`, `updateItem`; Task 4의 `parseDataFile`, `serializeDataFile`, `mergeItems`, `purgeDeleted`; Task 5의 Tauri 명령
- Produces:
  ```ts
  interface Backend { read(): Promise<string|null>; write(text: string): Promise<void>; backupCorrupt(): Promise<void>;
                      onChanged(cb: () => void): () => void }          // 구독 해제 함수 반환
  class ItemsStore {
    constructor(backend: Backend, now?: () => Date)
    items: Item[]; status: 'loading'|'ready'|'error'; error: string|null
    subscribe(cb: () => void): () => void
    load(): Promise<void>
    add(p: {text:string;kind:ItemKind;due:string|null;hasTime:boolean}): Promise<void>
    update(id: string, patch: Parameters<typeof updateItem>[1]): Promise<void>
    remove(id: string): Promise<void>      // deleted:true 로 표시
  }
  function tauriBackend(): Backend         // src/ui/api.ts, invoke('read_data') 등으로 구현
  ```
- 변경 흐름: 변경 → 파일을 다시 읽어 병합(`mergeItems`) → `purgeDeleted` → 저장 → 구독자에게 알림. `onChanged` 수신 시에도 같은 병합 후, 내용이 파일과 다르면 저장한다.

- [ ] **Step 1: `store.test.ts`를 작성한다.** 메모리 `Backend`(문자열 하나를 가진 가짜)를 쓴다.
  - 파일이 없으면 `load()` 후 `items:[]`, `status:'ready'`.
  - **(Review Focus 3)** 파일이 깨져 있으면 `backupCorrupt`가 1번 호출되고 `items:[]`, 이후 `add`로 저장해도 백업 호출은 늘지 않는다.
  - `add` 후 백엔드 문자열을 파싱하면 그 항목이 들어 있다.
  - **(Review Focus 2)** 가짜 백엔드의 내용을 "다른 PC가 항목 X를 추가한 것"으로 바꾼 뒤 `onChanged`를 발생시키면 스토어 `items`에 X가 생기고, 내 항목 Y도 사라지지 않는다. 다른 PC가 쓴 직후 내가 `add`해도 X가 파일에 남아 있다.
  - `remove` 후 `items`에서 선택자들이 해당 항목을 제외한다(`deleted:true`로 파일에는 남음).
  - 읽기 실패(예외)이면 `status:'error'`와 한국어 `error` 메시지, 이전 `items`는 유지.
- [ ] **Step 2: 실패를 확인한다.** Run: `npx vitest run src/core/store.test.ts`
- [ ] **Step 3: `ItemsStore`와 `tauriBackend`를 구현한다.**
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: items store with merge-on-write and tauri backend"`

---

### Task 7: 바탕화면 위젯

**Files:**
- Create: `src/ui/MemoInput.tsx`, `src/ui/Widget.tsx`, `src/ui/useNow.ts`, `src/entry-widget.tsx`, `widget.html`
- Modify: `src-tauri/tauri.conf.json`(위젯 창), `src-tauri/src/lib.rs`(트레이)
- Test: `src/ui/MemoInput.test.tsx`, `src/ui/Widget.test.tsx` (Vitest + @testing-library/react)

**Interfaces:**
- Consumes: `ItemsStore`, `urgentTasks`, `plainTodos`, `useNow`
- Produces:
  ```ts
  function useNow(tickMs?: number): Date                                // 기본 60000ms마다 갱신
  function MemoInput(props: { store: ItemsStore; now: () => Date; onDone?(): void; autoFocus?: boolean; placeholder?: string }): JSX.Element  // 한 줄 입력 + 미리보기. 위젯, 대시보드, 빠른 입력창이 공유
  function Widget(props: { store: ItemsStore; hotkeyLabel: string; onOpenQuick(): void; onOpenDashboard(): void }): JSX.Element
  ```
- 창 설정: 테두리 없음, 투명, 작업표시줄 숨김, 항상 아래(`alwaysOnBottom`), 크기 약 `300x520`, 화면 오른쪽 위 기본 위치, 위치·크기 기억.
- 화면(스펙 3.2): 맨 위 줄에 날짜와 `＋ 메모` 버튼(안에 `hotkeyLabel`), 그 아래에 `MemoInput`("＋ 메모 입력 후 Enter"). "🔥 급한 것"에는 `urgentTasks`를 마감 라벨(`오늘 17:00`, `내일`, `11/27`)과 함께, 마감이 지난 것은 빨강. "📝 할일 (n)"에는 `plainTodos`. 체크하면 `done:true`. 일정은 표시하지 않는다. 위젯 본문 클릭은 `onOpenDashboard`, 체크 칸 클릭은 대시보드를 열지 않는다.

- [ ] **Step 1: `MemoInput.test.tsx`와 `Widget.test.tsx`를 작성한다.**
  - `MemoInput` (기준 시각 `new Date('2026-11-20T09:00')`):
    - `'내일 3시 회의'`를 입력하면 미리보기에 `일정`과 `내일(11/21) 오후`가 보인다. Enter → `store.add`가 `{text:'내일 3시 회의', kind:'event', due:'2026-11-21T15:00', hasTime:true}`로 1번 호출되고 입력칸이 비워지며 `onDone`이 호출된다.
    - Tab → 종류가 `task`로 바뀌어 Enter 시 `kind:'task'`로 저장된다. 날짜 없는 입력은 `kind:'task'`, `due:null`.
    - **(Review Focus 1)** 빈 입력과 공백만 있는 입력에서 Enter는 `store.add`를 호출하지 않는다. Esc는 아무것도 저장하지 않고 `onDone`만 호출한다.
  - 위젯의 입력칸에 `내일 오전까지 견적서`를 쓰고 Enter → `store.add`가 `kind:'task'`, `due:'2026-11-21T12:00'`으로 1번 호출되고, 위젯 본문 클릭(대시보드 열기)은 호출되지 않는다.
  - `Widget`:
  - 급한 것 2개, 할일 3개, 일정 1개가 있으면 "급한 것"에 2개, "할일 (3)"에 3개가 보이고 일정 문구는 화면에 없다.
  - 마감이 오늘 17:00인 항목에는 `오늘 17:00` 라벨이 있다.
  - `＋ 메모` 버튼에 `Win+J` 같은 `hotkeyLabel`이 보이고 클릭하면 `onOpenQuick`이 1번 호출된다.
  - 체크 칸을 누르면 `store.update(id,{done:true})`가 호출되고 `onOpenDashboard`는 호출되지 않는다. 항목 영역 클릭은 `onOpenDashboard` 호출.
  - **(Review Focus 4)** 가짜 타이머로 자정을 넘기면(`useNow`가 갱신되면) 어제 마감이던 "내일" 라벨이 "오늘"로, 지난 항목은 빨강으로 바뀐다.
  - **(Review Focus 5)** 급한 것 200개를 넣어도 목록 컨테이너에 스크롤 스타일(`overflow-y: auto`)과 최대 높이가 있고, 120자 항목은 한 줄 말줄임 스타일이다. `status:'error'`이면 위젯 상단에 `store.error` 문구가 보인다.
- [ ] **Step 2: 실패를 확인한다.** Run: `npx vitest run src/ui/Widget.test.tsx`
- [ ] **Step 3: `MemoInput`, `useNow`, `Widget`, 진입점을 구현한다.** 시안(어두운 노션 스타일, 둥근 모서리, 입력칸은 파란 테두리)을 따른다.
- [ ] **Step 4: 위젯 창 설정과 트레이 아이콘을 `src-tauri`에 추가한다.** 트레이 클릭 = 위젯을 5초간 맨 앞으로 올렸다가 다시 아래로 내린다. 트레이 메뉴에 "종료"를 둔다.
- [ ] **Step 5: 통과를 확인한다.** Expected: 전부 PASS
- [ ] **Step 6: 윈도우에서 `Win+D`를 눌러도 위젯이 보이는지는 리눅스에서 확인할 수 없다.** 사용자 확인 목록(Task 11)에 넣고, 위젯이 사라지면 창을 바탕화면 레이어에 붙이는 방식으로 바꾸는 후속 작업을 만든다.
- [ ] **Step 7: Commit** `git add -A && git commit -m "feat: desktop widget window"`

---

### Task 8: 빠른 입력창과 전역 단축키

**Files:**
- Create: `src/ui/QuickInput.tsx`, `src/entry-quick.tsx`, `quick.html`
- Modify: `src-tauri/src/lib.rs`(단축키 등록, 창 열기/닫기), `tauri.conf.json`(quick 창)
- Test: `src/ui/QuickInput.test.tsx`

**Interfaces:**
- Consumes: `parseMemo`, `ItemsStore.add`, 이벤트 `hotkey-failed`
- Produces:
  ```ts
  function QuickInput(props: { store: ItemsStore; now: () => Date; onClose(): void }): JSX.Element
  ```
- 창: 화면 중앙, 약 `420x140`, 테두리 없음, 항상 위, 열리면 입력칸에 포커스, 포커스를 잃으면 닫힘.
- 동작(스펙 3.1): 입력할 때마다 `parseMemo`로 미리보기 한 줄을 보여준다(`인식됨 → 🔥 할일 · 마감 내일(11/21) 오전` / `📝 할일 (마감 없음)` / `🗓 일정 · …`). `Tab`은 일정↔할일을 바꾼다. `Enter`는 저장 후 닫기, `Esc`는 취소. 빈 입력의 `Enter`는 저장 없이 닫는다.
- 단축키: 앱 시작 때 설정의 `hotkey`(기본 `Super+J`)를 등록하고 누르면 quick 창을 연다(이미 열려 있으면 입력칸에 다시 포커스). 등록에 실패하면 `hotkey-failed` 이벤트를 내보내고 위젯 상단에 "이미 사용 중인 키입니다. 설정에서 다른 키를 골라 주세요"를 표시한다.

- [ ] **Step 1: `QuickInput.test.tsx`를 작성한다.** (입력 해석과 저장은 Task 7의 `MemoInput`이 맡으므로 `QuickInput`은 그것을 창 안에 담고 `onDone`을 `onClose`로 연결한다. 아래는 그 연결을 확인하는 최소 테스트다.)
  - `'내일 3시 회의'`를 입력하면 미리보기에 `일정`과 `내일(11/21) 오후`가 보인다.
  - Enter → `store.add`가 `{text:'내일 3시 회의', kind:'event', due:'2026-11-21T15:00', hasTime:true}`로 1번 호출되고 `onClose`가 호출된다.
  - Tab → 종류가 `task`로 바뀌어 Enter 시 `kind:'task'`로 저장된다.
  - 날짜 없는 입력은 `kind:'task'`, `due:null`.
  - **(Review Focus 1)** 빈 입력과 공백만 있는 입력에서 Enter는 `store.add`를 호출하지 않고 닫기만 한다. Esc는 아무것도 저장하지 않는다.
- [ ] **Step 2: 실패를 확인한다.** Run: `npx vitest run src/ui/QuickInput.test.tsx`
- [ ] **Step 3: `QuickInput`과 진입점을 구현한다.**
- [ ] **Step 4: Rust에서 `tauri-plugin-global-shortcut`으로 단축키 등록과 quick 창 열기를 구현하고, 위젯의 `＋ 메모` 버튼(`onOpenQuick`)도 같은 창 열기를 호출하게 연결한다.**
- [ ] **Step 5: 통과를 확인하고 윈도우 빌드가 통과하는지 확인한다.**
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: quick input window and global hotkey"`

---

### Task 9: 대시보드

**Files:**
- Create: `src/ui/Dashboard.tsx`, `src/ui/Calendar.tsx`, `src/ui/Clock.tsx`, `src/entry-dashboard.tsx`, `dashboard.html`, `src/assets/banner-room.png` (`docs/superpowers/assets/banner-room.png`를 복사)
- Modify: `tauri.conf.json`(dashboard 창), `src/ui/Widget.tsx`(열기 연결)
- Test: `src/ui/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `ItemsStore`, `soonTasks`, `upcomingEvents`, `plainTodos`, `markedDays`, `useNow`
- Produces:
  ```ts
  function Calendar(props: { year: number; month: number; today: Date; marked: Set<number>; onPrev(): void; onNext(): void }): JSX.Element
  function Clock(props: { now: Date }): JSX.Element                       // 큼직한 HH:MM:SS 타일
  function Dashboard(props: { store: ItemsStore; settings: Settings; onOpenSettings(): void }): JSX.Element
  ```
- 창: 약 `900x600`, 제목 표시줄 있음, 닫으면 숨김(앱은 계속 실행).
- 맨 위에 배너 이미지(`settings.bannerPath`가 있으면 그 파일, 없으면 기본 그림, 높이 `settings.bannerHeight`), 그 아래에 제목 "내 일정·할일", 왼쪽에 `Clock`, 오른쪽 위에 `MemoInput`("적고 Enter")이 있다.
- 화면(스펙 3.3): 2×2 카드 — 달력(일정/마감 있는 날 주황 점, 오늘 파랑), "🔥 오늘 / 임박"(`soonTasks`), "🗓 일정"(`upcomingEvents`, 시각 포함), "📝 할일"(`plainTodos`). 이 위에 "최근 완료" 카드는 없다. 각 항목은 체크, 수정(글자, 종류, 마감), 삭제를 할 수 있다. 오른쪽 위에 ⚙ 설정 버튼.

- [ ] **Step 1: `Dashboard.test.tsx`를 작성한다.**
  - 네 카드 제목(`오늘 / 임박`, `일정`, `할일`, 달력의 `11월`)이 있고 `최근 완료` 문구는 없다.
  - 마감 있는 할일은 "오늘 / 임박"에만, 일정은 "일정" 카드에만, 마감 없는 할일은 "할일" 카드에만 나타난다.
  - 달력: 2026년 11월에서 일정 11/24, 마감 11/27이 있으면 24일과 27일에 점 표시가 있고, 오늘 20일에 오늘 표시가 있다. ▶를 누르면 12월로 바뀐다.
  - 체크, 삭제, 종류 변경이 각각 `store.update`/`store.remove`를 올바른 인자로 호출한다.
  - 배너 이미지가 있고 `bannerHeight: 320`이면 높이가 320px이다. `bannerHeight: 240`이면 240px이다.
  - `Clock`은 `now = 2026-11-20T09:05:07`에서 `09`, `05`, `07`을 표시한다.
  - 대시보드의 입력칸에 `보고서 오탈자 확인`을 쓰고 Enter → `store.add`가 `kind:'task'`, `due:null`로 호출된다.
  - ⚙ 클릭 시 `onOpenSettings` 호출.
- [ ] **Step 2: 실패를 확인한다.** Run: `npx vitest run src/ui/Dashboard.test.tsx`
- [ ] **Step 3: `Calendar`, `Dashboard`, 진입점을 구현하고 위젯 본문 클릭이 대시보드 창을 열도록 Rust 쪽 명령을 연결한다.**
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: dashboard with calendar and cards"`

---

### Task 10: 설정, 자동 실행, 첫 실행 안내

**Files:**
- Create: `src/ui/SettingsPanel.tsx`
- Modify: `src/ui/Dashboard.tsx`(설정 패널 표시), `src-tauri/src/lib.rs`(자동 실행, 단축키 재등록, 폴더 선택)
- Test: `src/ui/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `get_settings`, `save_settings`, `tauri-plugin-dialog`, `tauri-plugin-autostart`
- Produces:
  ```ts
  function formatHotkey(tauriKey: string): string      // 'Super+J' → 'Win+J', 'Alt+Backquote' → 'Alt+₩'
  function SettingsPanel(props: { settings: Settings; onSave(s: Settings): Promise<void>; onPickFolder(): Promise<string|null>; hotkeyError: string|null }): JSX.Element
  ```
- 화면: 배너(기본 그림 또는 사용자가 고른 이미지 파일 `bannerPath`, 크기 작게 160/보통 240/크게 320px `bannerHeight`, 기본 크게), 단축키 칸(클릭 후 키 조합을 직접 누르면 입력, 2키 이상 조합만 허용), 데이터 폴더(현재 경로 + "폴더 선택" 버튼 + OneDrive 안 폴더 권장 문구), "윈도우 시작 시 자동 실행"(기본 켜짐). 단축키 등록 실패 시 `hotkeyError`("이미 사용 중인 키입니다")를 입력칸 아래에 빨강으로 표시하고 이전 키를 유지한다. 첫 실행(`dataDir`이 비어 있고 OneDrive 폴더가 있으면)에는 대시보드가 설정 패널을 먼저 열고 그 폴더를 기본값으로 채운다.

- [ ] **Step 1: `SettingsPanel.test.tsx`를 작성한다.**
  - `formatHotkey('Super+J') === 'Win+J'`, `formatHotkey('Alt+Backquote') === 'Alt+₩'`.
  - 키 조합 입력 칸에서 `Alt`+`Z`를 누르면 `onSave`가 `hotkey:'Alt+Z'`로 호출된다. 키 하나만(`J`)이나 `Win+M`은 저장되지 않고 안내 문구가 나온다.
  - 배너 크기 "보통"을 고르면 `bannerHeight:240`으로, "배너 이미지 선택"으로 파일을 고르면 `bannerPath`로 저장되고, "기본 그림으로"를 누르면 `bannerPath:null`이 된다.
  - `hotkeyError`가 있으면 해당 문구가 보인다.
  - "폴더 선택" 클릭 → `onPickFolder` 결과가 `dataDir`로 저장된다. 자동 실행 스위치를 끄면 `autostart:false`로 저장된다.
- [ ] **Step 2: 실패를 확인한다.** Run: `npx vitest run src/ui/SettingsPanel.test.tsx`
- [ ] **Step 3: `SettingsPanel`, `formatHotkey`를 구현하고, Rust에서 설정 저장 시 단축키를 해제 후 재등록, 자동 실행 플러그인 반영, 폴더가 바뀌면 감시 경로를 갱신한다.**
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: settings panel, autostart, hotkey remap"`

---

### Task 11: 설치 파일 배포와 사용자 확인

**Files:**
- Modify: `.github/workflows/build-windows.yml`(필요 시), `README.md`(설치 방법 한국어 안내)
- Create: `docs/superpowers/plans/windows-checklist.md`

**Interfaces:**
- Consumes: Task 1~10 전체

- [ ] **Step 1: 전체 테스트를 돌린다.** Run: `npm test && cargo test -p datafile` / Expected: 전부 통과
- [ ] **Step 2: `v0.1.0` 태그를 푸시해 설치 파일(`.exe`)을 만들고, 사용자가 받을 수 있는 방법(GitHub Releases의 비공개 저장소 링크 또는 산출물 다운로드)을 단계별 한국어 안내로 전달한다.**
- [ ] **Step 3: 사용자 확인 목록 `windows-checklist.md`를 만든다. 각 항목은 "하면 → 이렇게 되어야 함" 형식이다.**
  1. 설치 후 실행하면 위젯이 오른쪽 위에 나타난다.
  2. `Win+J`를 누르면 입력창이 뜨고 `내일 오전까지 견적서`가 "마감 내일 오전"으로 미리 보인다. Enter로 저장하면 위젯에 반영된다.
  3. 엑셀 등 다른 창을 위에 띄우면 위젯이 가려지고 업무를 방해하지 않는다.
  4. `Win+D`를 눌러도 위젯이 보인다. (안 보이면 알려 달라)
  5. 위젯 클릭 → 대시보드가 열리고 네 칸이 보인다.
  6. 설정에서 단축키를 `Alt+₩` 등으로 바꾸면 바로 적용되고, 이미 쓰는 키면 안내가 나온다.
  7. 두 번째 PC에 설치하고 같은 OneDrive 폴더를 고르면 같은 목록이 보인다. 한쪽에서 적은 메모가 몇 초 안에 다른 쪽에 나타난다.
  8. 컴퓨터를 다시 켜도 위젯이 자동으로 뜬다.
- [ ] **Step 4: 사용자의 확인 결과를 받아 문제가 있으면 새 태스크로 수정한다. Commit** `git add -A && git commit -m "docs: windows install guide and checklist"`

---

## Self-Review 결과

- **스펙 커버리지:** 3.1 입력창(Task 3, 8, 10) / 3.2 위젯(Task 7) / 3.3 대시보드(Task 9) / 3.4 동기화(Task 4, 5, 6, 10) / 4절 판단 사항(Task 2, 3에 명시) / 5절 접근 방식(Task 1, 5) / 6절 데이터 방식(Task 4, 5, 6) / 7절 설치 파일·자동 실행·트레이(Task 1, 7, 10, 11). 3.5 화면보호기는 2단계라 의도적으로 제외했다.
- **타입 일관성:** `Item`, `ItemKind`, `parseMemo`, `ItemsStore.add/update/remove`, `Settings`, `Backend`, `useNow`의 이름과 시그니처가 Task 2~10에서 같다.
- **알려진 위험:** (1) 윈도우에서 `Win+D` 시 위젯 유지 여부, (2) `Win+J` 등록 가능 여부, (3) 리눅스에서는 UI를 직접 실행할 수 없어 윈도우 검증이 사용자 확인에 의존하는 점. 모두 Task 7, 8, 11에 확인 단계가 있다.
