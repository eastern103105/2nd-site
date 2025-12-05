# Student Daily Summary - 배포 가이드

## 🎯 구현 완료 사항

### 1. Cloud Functions
- ✅ `functions/index.js` - 3개의 집계 함수
- ✅ `functions/package.json` - 의존성 설정
- ✅ Firebase 설정 업데이트

### 2. Firestore 설정
- ✅ 보안 규칙 추가 (`student_daily_summaries`)
- ✅ 인덱스 추가

---

## 📦 배포 단계

### Step 1: Functions 의존성 설치

```powershell
cd functions
npm install
```

### Step 2: Firebase 로그인 확인

```powershell
cd ../client
npx firebase login
```

### Step 3: Firestore 규칙 및 인덱스 배포

```powershell
npx firebase deploy --only firestore:rules,firestore:indexes
```

### Step 4: Cloud Functions 배포

```powershell
npx firebase deploy --only functions
```

**예상 시간:** 5-10분

---

## 🔍 작동 방식

### 자동 집계 프로세스

```
학생이 테스트 완료
    ↓
test_results 문서 생성
    ↓
Cloud Function 자동 트리거 (aggregateTestResult)
    ↓
student_daily_summaries/{userId}_{date} 업데이트
    ↓
요약 데이터 자동 계산:
- 총 테스트 수
- 평균 점수
- 정확도
- 학습한 단어장 목록
```

### 데이터 구조

```javascript
student_daily_summaries/{userId}_{date}
{
  userId: "student123",
  date: "2025-11-30",
  academyId: "academy_default",
  
  summary: {
    totalTests: 5,
    totalScore: 425,
    averageScore: 85,
    accuracy: 90,
    booksStudied: ["기본", "중급"],
    testModes: {
      "word_typing": 3,
      "meaning_choice": 2
    }
  },
  
  testRefs: [
    { id: "test1", time: "09:00", score: 90, book: "기본", mode: "word_typing" },
    { id: "test2", time: "14:30", score: 80, book: "중급", mode: "meaning_choice" }
  ],
  
  dollarTransactions: {
    earned: 50,
    spent: 20,
    balance: 30,
    transactions: [...]
  }
}
```

---

## 🧪 테스트 방법

### 1. 로컬 테스트 (Functions Emulator)

```powershell
cd functions
npm run serve
```

### 2. 프로덕션 테스트

1. 학생 계정으로 로그인
2. 테스트 완료
3. Firebase Console 확인:
   - Firestore → `student_daily_summaries` 컬렉션
   - Functions → 로그 확인

---

## 📊 예상 효과

### 읽기 횟수 비교

**현재 (캐싱 없이):**
- 학생 대시보드 로드: ~200 reads (전체 test_results)
- 50명 × 5회/일 = **50,000 reads/day**

**Daily Summary 적용 후:**
- 학생 대시보드 로드: 30 reads (최근 30일 요약)
- 50명 × 5회/일 = **7,500 reads/day**

**절감: 85%** (42,500 reads/day)

---

## ⚠️ 주의사항

### 기존 데이터 마이그레이션

현재 배포된 Functions는 **새로운 테스트 결과만** 집계합니다.

기존 데이터를 집계하려면 마이그레이션 스크립트 필요:

```javascript
// scripts/migrateExistingData.js (필요시 작성)
// 기존 test_results를 읽어서 daily summaries 생성
```

### 비용 고려

- Cloud Functions 호출: 테스트 1회당 1회 호출
- 무료 할당량: 월 2,000,000회
- 예상 사용량: 월 ~50,000회 (충분히 무료 범위 내)

---

## 🔄 다음 단계 (선택사항)

### Phase 2: 클라이언트 업데이트

StudentDashboard를 수정하여 daily summaries 사용:

```javascript
// 최근 30일 요약 조회 (30 reads vs 200 reads)
const last30Days = Array.from({length: 30}, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - i);
  return format(d, 'yyyy-MM-dd');
});

const summaries = await Promise.all(
  last30Days.map(date => 
    getDoc(doc(db, 'student_daily_summaries', `${userId}_${date}`))
  )
);
```

### Phase 3: Word Bundles

단어 조회 최적화 (10 reads → 1 read)

---

## 📝 체크리스트

- [ ] `cd functions && npm install` 실행
- [ ] Firebase 로그인 확인
- [ ] Firestore 규칙/인덱스 배포
- [ ] Cloud Functions 배포
- [ ] 테스트 실행 및 확인
- [ ] Firebase Console에서 로그 확인
- [ ] student_daily_summaries 문서 생성 확인
