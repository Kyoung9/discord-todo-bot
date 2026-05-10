# Discord Project Todo Bot 요건정리

## 1. 서비스 개요

본 서비스는 Discord 서버 안에서 팀원이 Todo, 프로젝트, 대회 일정, 하위 작업을 관리할 수 있도록 지원하는 Discord 봇이다.

사용자는 Discord에서 자연어 또는 명령어로 작업을 입력할 수 있으며, 봇은 이를 Notion DB에 저장한다.
AI API Key가 등록되어 있는 경우에는 자연어 입력에서 프로젝트, 대회, 큰 Task, Subtask, 담당자, 시작일, 마감일 등을 자동으로 추출한다.
AI API Key가 없는 경우에는 사용자가 입력한 내용을 그대로 Todo로 등록하는 일반 Todo 봇으로 동작한다.

초기 MVP에서는 **Todo / Project / Event / Subtask 관리**를 중심으로 구현하고, 회의록 요약 및 회의 기반 Todo 생성은 향후 확장 기능으로 둔다.

---

# 2. 핵심 목표

```text
Discord 안에서 팀 업무를 빠르게 Todo로 등록할 수 있게 한다.

Todo는 단독 작업일 수도 있고, 특정 Project/Event에 속할 수도 있다.

큰 Task 아래에 Subtask를 만들 수 있어야 한다.

대회, 해커톤, 발표, 팀 과제처럼 시작일과 종료일이 있는 Event를 관리할 수 있어야 한다.

AI API Key가 있으면 자연어 입력을 구조화된 Todo/Project/Subtask로 자동 변환한다.

AI API Key가 없거나 실패하면 일반 Todo 봇으로 동작한다.

Todo 데이터는 Notion DB에 저장한다.

마감일 또는 시작일이 가까워지면 Discord에서 알림을 보낸다.

봇을 다른 Discord 서버에도 공유할 수 있도록 서버별 설정 구조를 가진다.
```

---

# 3. MVP 범위

## 3.1 포함 기능

```text
- Discord 서버별 Notion 설정
- Discord 서버별 AI API Key 설정
- AI API Key 여러 개 등록
- AI API Key fallback 처리
- AI API Key가 없을 때 일반 Todo 등록
- Project/Event 생성
- Project/Event에 Todo 연결
- Parent Task / Subtask 구조
- Start Date / Due Date 관리
- 자연어 Todo 생성
- 등록 전 확인
- Todo 수정
- 담당자 지정
- 우선순위 지정
- Todo 목록 조회
- Project별 Todo 조회
- Todo 완료 처리
- Todo 취소/삭제
- 마감일 알림
- 시작일 알림
- API 사용량 측정
- 서버별 사용량 제한
```

## 3.2 MVP에서 제외할 기능

```text
- 음성 회의 녹음
- STT
- 자동 회의록 생성
- 회의 기반 Todo 생성
- Web 대시보드
- Gantt Chart
- 복잡한 결제 기능
- Slack / LINE 연동
```

## 3.3 향후 확장 기능

```text
- 회의록 요약
- 회의 내용 기반 Todo 자동 생성
- Discord 음성 회의 STT
- 일일/주간 업무 리포트
- 프로젝트별 진행률 리포트
- Gantt Chart / Calendar View
- Web 관리 대시보드
- Notion 외부 DB 연동
```

---

# 4. 주요 개념 정의

## 4.1 Project

Project는 여러 Todo를 묶는 상위 단위이다.

예시:

```text
AI Todo Bot 개발
졸업연구 발표 준비
팀 과제
서비스 출시 준비
```

Project는 시작일과 종료일을 가질 수 있지만, 반드시 필요한 것은 아니다.

---

## 4.2 Event

Event는 시작일과 종료일이 명확한 일정 중심 단위이다.

예시:

```text
해커톤
공모전
대회
발표회
면접
전시회
NexTech Week
```

Event도 Project처럼 Todo를 가질 수 있다.

예시:

```text
해커톤
├─ 아이디어 정리
├─ 데모 개발
├─ 발표자료 작성
└─ 발표 연습
```

---

## 4.3 Task

Task는 실제 해야 할 작업이다.

예시:

```text
발표자료 작성
데모 배포
README 수정
디자인 정리
```

Task는 단독으로 존재할 수도 있고, Project/Event에 속할 수도 있다.

---

## 4.4 Parent Task / Subtask

큰 작업은 하위 작업을 가질 수 있다.

예시:

```text
발표 준비
├─ 발표자료 작성
├─ 발표 대본 작성
└─ 발표 연습
```

상위 Task는 Parent Task, 하위 작업은 Subtask로 관리한다.

---

# 5. 주요 사용자 흐름

## 5.1 초기 설정 흐름

관리자가 Discord 서버에 봇을 초대한다.

그 후 Notion을 연결한다.

```text
/setup-notion
```

입력 항목:

```text
- Notion API Key
- Notion Tasks Database ID
- Notion Projects Database ID
```

선택적으로 AI API Key를 등록한다.

```text
/setup-ai-key add
```

입력 항목:

```text
- Provider: openai
- Key Name: main-key
- API Key
- Priority
```

설정이 완료되면 해당 Discord 서버에서 Todo 기능을 사용할 수 있다.

---

## 5.2 AI API Key가 있는 경우

사용자 입력:

```text
/todo 6월 1일부터 해커톤이 시작되니까 그 전까지 발표자료 만들고 데모 배포하고 디자인 정리해야 해
```

봇 처리:

```text
1. 서버 설정 확인
2. 사용 가능한 AI API Key 선택
3. AI API 호출
4. Project/Event와 Todo 후보 추출
5. 시작일, 마감일, 담당자 추출
6. Discord에서 확인 메시지 표시
7. 사용자가 등록/수정/취소 선택
8. 등록 시 Notion DB에 저장
```

봇 출력 예시:

```text
AI가 아래 내용을 감지했습니다.

Event 후보:
- 이름: 해커톤
- 시작일: 2026-06-01
- 종료일: 미정

Todo 후보:
1. 발표자료 만들기
   Project/Event: 해커톤
   담당자: 미정
   시작일: 미정
   마감일: 2026-05-31 23:59
   우선순위: Medium

2. 데모 배포
   Project/Event: 해커톤
   담당자: 미정
   시작일: 미정
   마감일: 2026-05-31 23:59
   우선순위: High

3. 디자인 정리
   Project/Event: 해커톤
   담당자: 미정
   시작일: 미정
   마감일: 2026-05-31 23:59
   우선순위: Medium

[등록하기] [수정하기] [취소하기]
```

---

## 5.3 AI API Key가 없는 경우

사용자 입력:

```text
/todo 발표자료 작성
```

봇 처리:

```text
1. 서버 설정 확인
2. AI API Key 없음 확인
3. 입력 문장을 그대로 Todo 제목으로 사용
4. 등록 전 확인
5. Notion DB에 저장
```

봇 출력 예시:

```text
Todo를 등록하시겠습니까?

제목: 발표자료 작성
Project/Event: 없음
담당자: 미정
시작일: 미정
마감일: 미정
우선순위: Medium

[등록하기] [수정하기] [취소하기]
```

---

## 5.4 Parent Task와 Subtask 생성

사용자 입력:

```text
/todo 발표 준비해야 하는데 슬라이드 만들고 대본 쓰고 발표 연습도 해야 해
```

AI 사용 시 봇 출력:

```text
AI가 큰 Task와 Subtask를 감지했습니다.

Parent Task:
- 발표 준비

Subtasks:
1. 슬라이드 만들기
2. 대본 쓰기
3. 발표 연습

[등록하기] [수정하기] [취소하기]
```

저장 구조:

```text
발표 준비
├─ 슬라이드 만들기
├─ 대본 쓰기
└─ 발표 연습
```

---

## 5.5 AI API Key가 실패한 경우

AI API Key가 여러 개 등록되어 있으면 봇은 순서대로 후보 Key를 사용한다.

```text
main-key 실패
↓
backup-key 시도
↓
backup-key 성공
↓
AI Todo 생성
```

모든 Key가 실패하면 일반 Todo 모드로 전환한다.

```text
AI API Key가 모두 실패했습니다.
이번 Todo는 입력한 문장을 그대로 등록합니다.

제목: 6월 1일부터 해커톤이 시작되니까 그 전까지 발표자료 만들고 데모 배포하고 디자인 정리해야 해

[등록하기] [수정하기] [취소하기]
```

---

# 6. 기능 요건

## 6.1 서버별 설정 기능

Discord 서버마다 별도의 설정을 저장할 수 있어야 한다.

저장 항목:

```text
- Discord Guild ID
- Notion API Key
- Notion Tasks Database ID
- Notion Projects Database ID
- AI 사용 여부
- Timezone
- Reminder Channel ID
- Admin Role ID
```

명령어:

```text
/setup-notion
/setup-timezone
/setup-channel
/setup-role
/settings
/disconnect-notion
/delete-server-settings
```

---

## 6.2 Notion 연동 기능

관리자는 Discord 명령어를 통해 Notion API Key와 Database ID를 등록할 수 있어야 한다.

Notion 연결 시 다음 검사를 수행한다.

```text
- Notion API Key가 유효한지 확인
- Tasks Database ID가 유효한지 확인
- Projects Database ID가 유효한지 확인
- Integration이 해당 DB에 연결되어 있는지 확인
- 필수 속성이 존재하는지 확인
```

---

## 6.3 AI API Key 등록 기능

서버별로 AI API Key를 여러 개 등록할 수 있어야 한다.

명령어:

```text
/setup-ai-key add
/setup-ai-key list
/setup-ai-key test
/setup-ai-key disable
/setup-ai-key remove
/setup-ai-key priority
```

등록 항목:

```text
- Provider
- Key Name
- API Key
- Priority
```

API Key 목록 조회 시 실제 API Key는 절대 표시하지 않는다.

출력 예시:

```text
등록된 AI API Key

1. main-key
   Provider: openai
   Priority: 1
   Status: active
   Last Success: 2026-05-10 14:20

2. backup-key
   Provider: openai
   Priority: 2
   Status: cooldown
   Last Failed: 2026-05-10 15:10
```

---

## 6.4 AI API Key fallback 기능

AI API Key가 여러 개 등록되어 있을 경우, 봇은 다음 기준으로 사용할 Key를 선택한다.

```text
1. status = active
2. cooldown 상태가 아님
3. 오늘 사용량 제한을 초과하지 않음
4. priority가 높은 Key 우선
5. 같은 priority라면 오늘 사용량이 적은 Key 우선
```

AI 호출 실패 시 다음 Key를 시도한다.

모든 Key가 실패하면 AI 기능을 사용하지 않고 일반 Todo 등록 모드로 전환한다.

---

## 6.5 Project/Event 생성 기능

사용자는 Project 또는 Event를 생성할 수 있어야 한다.

명령어 예시:

```text
/project-create name: AI Todo Bot 개발 start:2026-05-10 end:2026-06-01
/event-create name: 해커톤 start:2026-06-01 end:2026-06-03
```

Project/Event 필드:

```text
- 이름
- 타입
- 상태
- 시작일
- 종료일
- 설명
- 생성자
```

타입 예시:

```text
Project
Event
Competition
Presentation
Assignment
Research
Other
```

상태 예시:

```text
Planning
Active
Done
Canceled
```

---

## 6.6 Project/Event에 Todo 연결 기능

Todo는 특정 Project/Event에 연결될 수 있어야 한다.

명령어 예시:

```text
/todo project:해커톤 text:발표자료 만들기
```

또는 AI가 자연어에서 자동 감지한다.

```text
해커톤 준비로 발표자료 만들고 데모 배포해야 해
```

AI 결과:

```text
Project/Event: 해커톤
Tasks:
- 발표자료 만들기
- 데모 배포
```

---

## 6.7 Parent Task / Subtask 기능

Task는 상위 Task와 하위 Task를 가질 수 있어야 한다.

명령어 예시:

```text
/todo-add title: 발표 준비 project:해커톤
/subtask-add parent:1 title: 발표자료 작성
/subtask-add parent:1 title: 발표 대본 작성
```

AI가 자연어에서 자동 구조화할 수도 있어야 한다.

```text
발표 준비해야 하는데 슬라이드 만들고 대본 쓰고 발표 연습도 해야 해
```

AI 결과:

```text
Parent Task: 발표 준비
Subtasks:
- 슬라이드 만들기
- 대본 쓰기
- 발표 연습
```

---

## 6.8 Todo 생성 기능

사용자는 `/todo` 명령어로 Todo를 생성할 수 있어야 한다.

AI가 활성화된 경우:

```text
- 자연어 입력 분석
- 단일 Todo 추출
- 여러 Todo 추출
- Project/Event 추출
- Parent Task/Subtask 추출
- 담당자 추출
- 시작일 추출
- 마감일 추출
- 우선순위 추정
```

AI가 비활성화된 경우:

```text
- 입력 문장을 그대로 Todo 제목으로 사용
- 담당자, 시작일, 마감일, 우선순위는 옵션 또는 수정 화면에서 설정
```

---

## 6.9 등록 전 확인 기능

AI 사용 여부와 관계없이 Todo는 바로 저장하지 않고, 등록 전 확인 단계를 거친다.

확인 화면에서 표시할 항목:

```text
- Todo 제목
- 설명
- Project/Event
- Parent Task
- Subtask 여부
- 담당자
- 시작일
- 마감일
- 우선순위
- 상태
```

버튼:

```text
[등록하기]
[수정하기]
[취소하기]
```

AI가 여러 Todo 후보를 생성한 경우:

```text
- 전체 등록
- 개별 수정
- 개별 삭제
- 전체 취소
```

기능을 제공한다.

---

## 6.10 Todo 수정 기능

사용자는 등록 전 또는 등록 후 Todo를 수정할 수 있어야 한다.

수정 가능한 항목:

```text
- 제목
- 설명
- Project/Event
- Parent Task
- 담당자
- 시작일
- 마감일
- 우선순위
- 상태
```

명령어:

```text
/todo-edit
```

또는 확인 메시지의 `[수정하기]` 버튼을 통해 수정한다.

---

## 6.11 담당자 지정 기능

담당자는 Discord 유저 기준으로 지정한다.

저장 항목:

```text
- Assignee Name
- Assignee Discord ID
- Assignee Mention
```

사용자가 멘션을 입력한 경우:

```text
@minsu 발표자료 수정
```

봇은 Discord User ID를 직접 저장한다.

AI가 이름만 추출한 경우:

```text
민수는 디자인 정리
```

Discord 유저와 매칭이 불확실하면 사용자에게 확인을 요청한다.

```text
“민수”가 누구인가요?

[사용자 선택]
```

향후 확장으로 별명 매핑 기능을 제공할 수 있다.

```text
/user-alias add name: 민수 user: @minsu
```

---

## 6.12 시작일 / 마감일 지정 기능

Task는 시작일과 마감일을 가질 수 있어야 한다.

```text
Start Date: 작업을 시작할 날짜
Due Date: 작업을 끝내야 하는 날짜
```

사용자는 자연어 또는 명시적 날짜로 입력할 수 있다.

예시:

```text
내일부터 시작
오늘 밤까지
금요일까지
5/12까지
2026-05-12 18:00까지
6월 1일부터 대회 시작
```

날짜 해석 규칙:

```text
오늘까지 → 오늘 23:59
내일까지 → 내일 23:59
오늘 밤까지 → 오늘 23:59
오전까지 → 해당 날짜 12:00
오후까지 → 해당 날짜 18:00
부터 / 시작 → Start Date로 해석
까지 / 마감 / 제출 → Due Date로 해석
시간 정보가 없으면 기본 23:59
날짜가 불명확하면 null 처리 후 사용자 확인
```

기준 시간대는 서버별 timezone 설정을 따른다.

기본값:

```text
Asia/Tokyo
```

---

## 6.13 Todo 목록 조회 기능

사용자는 현재 Todo 목록을 조회할 수 있어야 한다.

명령어:

```text
/todo-list
```

기본 조회 대상:

```text
Status가 Done 또는 Canceled가 아닌 Todo
```

출력 예시:

```text
현재 Todo 목록

#1 발표자료 수정
Project/Event: 해커톤
담당자: @민수
시작일: 2026-05-25
마감일: 2026-05-31 23:59
상태: Todo
우선순위: Medium

#2 데모 배포
Project/Event: 해커톤
담당자: @kyoungpin
시작일: 미정
마감일: 2026-05-31 23:59
상태: Doing
우선순위: High
```

선택 필터:

```text
/todo-list mine
/todo-list today
/todo-list overdue
/todo-list status:Doing
/todo-list project:해커톤
/todo-list event:해커톤
```

---

## 6.14 Project/Event별 Todo 조회 기능

특정 Project/Event에 속한 Todo를 조회할 수 있어야 한다.

명령어:

```text
/project-tasks project:해커톤
```

출력 예시:

```text
해커톤

기간: 2026-06-01 ~ 2026-06-03
진행률: 5 / 12 완료

Todo
- 발표자료 작성
- 디자인 정리

Doing
- 데모 개발

Done
- 아이디어 정리
```

---

## 6.15 Todo 완료 처리 기능

사용자는 특정 Todo를 완료 처리할 수 있어야 한다.

명령어:

```text
/todo-done id:3
```

처리 결과:

```text
#3 데모 버그 수정이 완료 처리되었습니다.
```

Notion DB의 Status를 `Done`으로 변경한다.

저장 항목:

```text
- Done By
- Done At
```

Subtask가 모두 Done이 되면 Parent Task의 진행률에 반영한다.

---

## 6.16 Todo 삭제 / 취소 기능

Todo를 삭제하거나 취소 처리할 수 있어야 한다.

명령어:

```text
/todo-delete id:3
```

권장 정책:

```text
관리자: 삭제 가능
일반 사용자: Canceled 처리 가능
```

삭제보다 `Canceled` 상태를 추천한다.
이유는 기록을 남길 수 있기 때문이다.

---

## 6.17 알림 기능

봇은 주기적으로 Notion DB를 조회하여 시작일 또는 마감일이 가까운 Todo를 알린다.

기본 알림 기준:

```text
시작일 당일
마감 24시간 전
마감 3시간 전
마감 1시간 전
마감 초과
```

알림 예시:

```text
📌 오늘 시작할 Task입니다.

#5 발표자료 작성
Project/Event: 해커톤
담당자: @민수
마감: 2026-05-31 23:59
```

```text
⏰ 마감 3시간 전입니다.

#2 데모 버그 수정
담당자: @kyoungpin
마감: 오늘 18:00
```

중복 알림 방지를 위해 Notion DB에 알림 여부를 저장한다.

```text
Start Notified
Reminded 24h
Reminded 3h
Reminded 1h
Overdue Notified
```

---

# 7. API 사용량 측정 요건

## 7.1 측정 대상

AI API 요청마다 다음 정보를 저장한다.

```text
- Discord Guild ID
- API Key ID
- Provider
- Model
- Request Type
- Input Tokens
- Output Tokens
- Total Tokens
- Success 여부
- Error Code
- Fallback 사용 여부
- Created At
```

---

## 7.2 사용량 리셋 기준

사용량 제한은 서버별 timezone 기준으로 매일 00:00에 리셋된다.

기본 timezone:

```text
Asia/Tokyo
```

실제 로그는 삭제하지 않는다.

```text
리셋 = 오늘 사용량 계산 범위가 새로 시작됨
로그 삭제 = 하지 않음
```

---

## 7.3 제한 기준

요청 횟수와 토큰 사용량을 둘 다 제한한다.

MVP 기본값 예시:

```text
서버당 하루 AI 요청 100회
서버당 하루 100,000 tokens
요청 1회당 최대 입력 길이 제한
```

사용자 API Key를 등록한 경우에는 제한을 완화할 수 있다.

```text
서버당 하루 AI 요청 500회
서버당 하루 1,000,000 tokens
```

---

## 7.4 사용량 초과 시 동작

서버 또는 API Key가 사용량 제한을 초과한 경우, AI를 사용하지 않고 일반 Todo 등록 모드로 전환한다.

출력 예시:

```text
오늘 AI 사용량 한도에 도달했습니다.
이번 Todo는 입력한 문장을 그대로 등록합니다.

제목: 해커톤 준비로 발표자료 만들고 데모 배포해야 해

[등록하기] [수정하기] [취소하기]
```

---

## 7.5 사용량 조회 명령어

관리자는 사용량을 조회할 수 있어야 한다.

명령어:

```text
/usage today
/usage month
/usage keys
```

출력 예시:

```text
오늘 AI 사용량

기준: 2026-05-10 00:00 ~ 23:59 Asia/Tokyo

요청 수: 23 / 100
총 토큰: 31,420 / 100,000
성공: 22
실패: 1
Fallback: 1
```

---

# 8. 권한 요건

## 8.1 관리자 권한

관리자만 가능한 기능:

```text
- Notion API 설정
- AI API Key 등록
- AI API Key 삭제
- AI API Key 비활성화
- 사용량 제한 변경
- 알림 채널 설정
- 관리자 Role 설정
- 서버 설정 삭제
- Project/Event 삭제
```

관리자 판정 기준:

```text
- Discord Server Administrator 권한
또는
- 봇에 등록된 관리자 Role 보유
```

---

## 8.2 일반 사용자 권한

일반 사용자가 가능한 기능:

```text
- Todo 생성
- Todo 목록 조회
- Project/Event별 Todo 조회
- 본인 담당 Todo 완료 처리
- 본인이 만든 Todo 수정
```

서버 설정에 따라 모든 Todo 수정 권한을 허용할 수도 있다.

---

# 9. 보안 요건

API Key는 민감 정보이므로 다음 조건을 반드시 만족해야 한다.

```text
- API Key는 평문 저장 금지
- DB에는 암호화해서 저장
- Discord 채널에 API Key 노출 금지
- 설정 명령어 응답은 ephemeral 처리
- 로그에 API Key 출력 금지
- 에러 메시지에 API Key 포함 금지
- API Key 목록 조회 시 실제 Key 표시 금지
```

환경변수:

```env
ENCRYPTION_KEY=암호화에_사용할_마스터키
```

API Key 저장 흐름:

```text
사용자가 API Key 입력
→ 서버에서 암호화
→ DB에 encrypted value 저장
→ API 호출 시에만 복호화
```

---

# 10. 데이터베이스 설계

## 10.1 guild_settings

Discord 서버별 설정 저장 테이블.

```text
id
guild_id
notion_api_key_encrypted
notion_tasks_database_id
notion_projects_database_id
ai_enabled
timezone
reminder_channel_id
admin_role_id
created_by
created_at
updated_at
```

---

## 10.2 ai_api_keys

서버별 AI API Key 저장 테이블.

```text
id
guild_id
provider
key_name
encrypted_api_key
priority
status
last_used_at
last_success_at
last_failed_at
failure_count
cooldown_until
created_by
created_at
updated_at
```

status:

```text
active
cooldown
error
disabled
```

---

## 10.3 ai_usage_logs

AI 요청별 상세 로그.

```text
id
guild_id
api_key_id
provider
model
request_type
input_tokens
output_tokens
total_tokens
success
error_code
fallback_used
created_at
```

---

## 10.4 guild_daily_usage

서버별 일일 사용량 집계.

```text
id
guild_id
date
timezone
request_count
total_tokens
success_count
failure_count
fallback_count
created_at
updated_at
```

---

## 10.5 api_key_daily_usage

API Key별 일일 사용량 집계.

```text
id
api_key_id
guild_id
date
request_count
total_tokens
success_count
failure_count
created_at
updated_at
```

---

## 10.6 task_action_logs

Todo 변경 이력 저장.

```text
id
guild_id
task_id
action_type
before_value
after_value
acted_by
created_at
```

action_type 예시:

```text
created
updated
done
deleted
canceled
reminded
```

---

# 11. Notion DB 설계

## 11.1 Projects DB

Project/Event 데이터를 저장한다.

| 속성명              | 타입     | 설명                                                                           |
| ---------------- | ------ | ---------------------------------------------------------------------------- |
| Name             | Title  | Project/Event 이름                                                             |
| Type             | Select | Project / Event / Competition / Presentation / Assignment / Research / Other |
| Status           | Select | Planning / Active / Done / Canceled                                          |
| Start Date       | Date   | 시작일                                                                          |
| End Date         | Date   | 종료일                                                                          |
| Description      | Text   | 설명                                                                           |
| Discord Guild ID | Text   | Discord 서버 ID                                                                |
| Created By       | Text   | 생성자                                                                          |
| Created At       | Date   | 생성일                                                                          |
| Updated At       | Date   | 수정일                                                                          |

---

## 11.2 Tasks DB

Todo / Task / Subtask 데이터를 저장한다.

| 속성명                 | 타입       | 설명                                      |
| ------------------- | -------- | --------------------------------------- |
| Title               | Title    | Todo 제목                                 |
| Description         | Text     | 상세 설명                                   |
| Status              | Select   | Todo / Doing / Review / Done / Canceled |
| Project             | Relation | Projects DB와 연결                         |
| Parent Task         | Relation | 상위 Task                                 |
| Task Level          | Select   | Single / Parent / Subtask               |
| Assignee Name       | Text     | 담당자 이름                                  |
| Assignee Discord ID | Text     | 담당자 Discord ID                          |
| Assignee Mention    | Text     | Discord 멘션 문자열                          |
| Start Date          | Date     | 작업 시작일                                  |
| Due Date            | Date     | 작업 마감일                                  |
| Priority            | Select   | High / Medium / Low                     |
| Source Type         | Select   | manual / ai_text                        |
| Source Text         | Text     | 원본 입력                                   |
| Discord Guild ID    | Text     | Discord 서버 ID                           |
| Discord Channel ID  | Text     | 생성 채널 ID                                |
| Created By          | Text     | 생성자 Discord ID                          |
| Created At          | Date     | 생성일                                     |
| Updated At          | Date     | 수정일                                     |
| Done By             | Text     | 완료 처리자                                  |
| Done At             | Date     | 완료일                                     |
| Start Notified      | Checkbox | 시작일 알림 여부                               |
| Reminded 24h        | Checkbox | 24시간 전 알림 여부                            |
| Reminded 3h         | Checkbox | 3시간 전 알림 여부                             |
| Reminded 1h         | Checkbox | 1시간 전 알림 여부                             |
| Overdue Notified    | Checkbox | 마감 초과 알림 여부                             |

---

# 12. 주요 명령어 정리

## 12.1 설정 명령어

```text
/setup-notion
/setup-ai-key add
/setup-ai-key list
/setup-ai-key test
/setup-ai-key disable
/setup-ai-key remove
/setup-ai-key priority
/setup-timezone
/setup-channel
/setup-role
/settings
/disconnect-notion
/delete-server-settings
```

---

## 12.2 Project/Event 명령어

```text
/project-create
/event-create
/project-list
/project-tasks
/project-edit
/project-delete
```

---

## 12.3 Todo 명령어

```text
/todo
/todo-list
/todo-edit
/todo-done
/todo-delete
/subtask-add
```

---

## 12.4 사용량 명령어

```text
/usage today
/usage month
/usage keys
```

---

# 13. AI 처리 요건

AI는 사용자의 자연어 입력을 분석하여 아래 유형 중 하나로 분류한다.

```text
1. 단일 Todo
2. 여러 개의 독립 Todo
3. Project/Event 생성
4. Project/Event에 속한 Todo
5. Parent Task + Subtasks
```

AI 추출 항목:

```text
- detectedType
- project/event 정보
- task 목록
- parentTask
- subtasks
- assigneeName
- assigneeDiscordId
- startDate
- dueAt
- priority
- confidence
- questions
```

AI 출력 예시:

```json
{
  "detectedType": "project_with_tasks",
  "project": {
    "name": "해커톤",
    "type": "Competition",
    "startDate": "2026-06-01T00:00:00+09:00",
    "endDate": null
  },
  "tasks": [
    {
      "title": "발표자료 만들기",
      "description": null,
      "assigneeName": null,
      "assigneeDiscordId": null,
      "startDate": null,
      "dueAt": "2026-05-31T23:59:00+09:00",
      "priority": "medium",
      "subtasks": []
    },
    {
      "title": "데모 배포",
      "description": null,
      "assigneeName": null,
      "assigneeDiscordId": null,
      "startDate": null,
      "dueAt": "2026-05-31T23:59:00+09:00",
      "priority": "high",
      "subtasks": []
    }
  ],
  "questions": [
    "해커톤 종료일이 명확하지 않습니다."
  ]
}
```

AI 처리 규칙:

```text
- Todo로 보기 어려운 문장은 제외
- 담당자가 불명확하면 null
- 날짜가 불명확하면 null
- Project/Event가 불명확하면 사용자 확인
- Parent/Subtask 구조가 애매하면 단일 Task로 처리
- 확신도가 낮으면 confidence를 낮게 설정
- 바로 등록하지 않고 사용자 확인 단계로 넘김
```

---

# 14. 알림 처리 요건

알림 스케줄러는 주기적으로 Notion DB를 조회한다.

조회 조건:

```text
Status != Done
Status != Canceled
Start Date 또는 Due Date가 존재함
```

알림 조건:

```text
오늘 시작하는 Task
마감 24시간 이내
마감 3시간 이내
마감 1시간 이내
마감 초과
```

중복 알림 방지:

```text
Start Notified = true면 시작일 알림 재발송하지 않음
Reminded 24h = true면 24시간 알림 재발송하지 않음
Reminded 3h = true면 3시간 알림 재발송하지 않음
Reminded 1h = true면 1시간 알림 재발송하지 않음
Overdue Notified = true면 마감 초과 알림 재발송하지 않음
```

---

# 15. 에러 처리 요건

## 15.1 Notion 연결 실패

```text
Notion 연결에 실패했습니다.

확인해주세요:
1. Notion API Key가 맞는지
2. Tasks DB와 Projects DB에 Integration을 연결했는지
3. Database ID가 맞는지
4. DB에 필수 속성이 있는지
```

## 15.2 AI API 실패

```text
AI API 호출에 실패했습니다.
다음 후보 API Key를 사용합니다.
```

모든 Key 실패 시:

```text
등록된 AI API Key가 모두 실패했습니다.
이번 Todo는 입력한 문장을 그대로 등록합니다.
```

## 15.3 권한 부족

```text
이 명령어는 관리자만 사용할 수 있습니다.
```

## 15.4 Notion 미설정

```text
아직 Notion이 연결되지 않았습니다.
관리자가 /setup-notion 명령어로 먼저 설정해주세요.
```

---

# 16. 비기능 요건

## 16.1 사용성

```text
- 사용자는 자연어로 Todo를 등록할 수 있어야 한다.
- AI가 없어도 일반 Todo 봇으로 사용할 수 있어야 한다.
- Project/Event 단위로 작업을 묶을 수 있어야 한다.
- 큰 Task를 Subtask로 나눌 수 있어야 한다.
- 등록 전 확인/수정 흐름을 제공해야 한다.
- 에러 메시지는 사용자가 해결할 수 있는 형태로 제공해야 한다.
```

## 16.2 보안성

```text
- API Key는 암호화 저장한다.
- API Key는 로그와 Discord 채널에 노출하지 않는다.
- 설정 명령어는 관리자만 사용할 수 있다.
```

## 16.3 확장성

```text
- 서버별 설정 구조를 사용한다.
- AI Provider는 향후 OpenAI 외 다른 Provider도 추가 가능하도록 설계한다.
- Notion 저장 로직은 Repository 계층으로 분리한다.
- 향후 PostgreSQL/Supabase 기반 Todo 저장으로 변경 가능하게 한다.
- 회의록 기능을 나중에 추가할 수 있도록 Project/Task 구조를 유지한다.
```

## 16.4 안정성

```text
- AI API 실패 시 일반 Todo 모드로 fallback한다.
- 특정 API Key 실패 시 다른 Key로 fallback한다.
- 마감 알림은 중복 발송하지 않는다.
- 시작일 알림은 중복 발송하지 않는다.
- Notion에서 Done 처리된 Todo에는 알림을 보내지 않는다.
```

---

# 17. 시스템 구성

```text
Discord
↓
discord.js Bot
↓
Command Handler
↓
Guild Settings Service
↓
Project Service
↓
Todo Service
↓
AI Service
↓
Notion Repository
↓
Notion Projects DB / Tasks DB
```

AI Key fallback 흐름:

```text
Todo 요청
↓
서버 설정 확인
↓
AI 활성화 여부 확인
↓
사용 가능한 API Key 목록 조회
↓
Key 선택
↓
AI 호출
↓
실패 시 다음 Key
↓
전부 실패 시 일반 Todo 생성
```

알림 흐름:

```text
Scheduler
↓
서버별 Notion DB 조회
↓
시작 예정 / 마감 임박 Todo 확인
↓
Discord 알림 발송
↓
Notion 알림 플래그 업데이트
```

---

# 18. 개발 우선순위

## Phase 1: 기본 Todo + Notion 연동

```text
1. Discord 봇 생성
2. /setup-notion 구현
3. Notion DB 연결 테스트
4. /todo 구현
5. 입력 그대로 Todo 생성
6. 등록 전 확인
7. Notion Tasks DB 저장
8. /todo-list 구현
9. /todo-done 구현
```

## Phase 2: Project/Event 구조

```text
1. Projects DB 연결
2. /project-create 구현
3. /event-create 구현
4. Todo와 Project/Event 연결
5. /project-tasks 구현
6. Start Date 추가
```

## Phase 3: Subtask 구조

```text
1. Parent Task 필드 추가
2. /subtask-add 구현
3. AI 없이 Subtask 수동 등록
4. Project/Event별 Subtask 조회
```

## Phase 4: AI 기능

```text
1. /setup-ai-key add 구현
2. API Key 암호화 저장
3. AI Todo 추출 구현
4. Project/Event 자동 추출
5. Parent/Subtask 자동 추출
6. AI 결과 확인 화면 구현
7. AI Key 없을 때 일반 Todo fallback
```

## Phase 5: 여러 API Key + fallback

```text
1. ai_api_keys 테이블 구현
2. priority 기반 Key 선택
3. 실패 시 다음 Key 사용
4. cooldown/error 상태 처리
5. /setup-ai-key list/test/disable/remove 구현
```

## Phase 6: 알림 기능

```text
1. 시작일 알림 구현
2. 마감 알림 스케줄러 구현
3. 24h/3h/1h/overdue 알림 구현
4. 중복 알림 방지
5. 알림 채널 설정
```

## Phase 7: 사용량 측정

```text
1. ai_usage_logs 저장
2. guild_daily_usage 집계
3. api_key_daily_usage 집계
4. /usage today 구현
5. 사용량 초과 시 일반 Todo fallback
```

## Phase 8: 향후 회의록 확장

```text
1. /meeting-text 명령어 추가
2. 회의록 요약
3. 회의 기반 Todo 후보 생성
4. 회의록 Notion 저장
```

---

# 19. 최종 요약

본 프로젝트는 Discord 서버에서 팀의 Todo, Project, Event, Subtask를 관리하기 위한 Notion 연동 작업 관리 봇이다.

초기 버전에서는 Todo 생성, Project/Event 연결, Parent Task/Subtask 관리, 시작일/마감일 관리, 알림 기능에 집중한다.
AI API Key가 등록된 경우에는 자연어 입력을 분석하여 Project/Event, Todo, Subtask, 담당자, 시작일, 마감일을 자동 추출한다.
AI API Key가 없거나 실패한 경우에는 입력 내용을 그대로 Todo로 등록하는 일반 Todo 봇으로 동작한다.

또한 Discord 서버별 설정, 여러 AI API Key 등록, API Key fallback, 사용량 측정, 일일 사용량 제한, Notion DB 연동을 제공하여 나중에 다른 팀에도 쉽게 공유할 수 있는 구조로 설계한다.
