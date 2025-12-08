# Option B: UI統一パッチ（Alert → カードUI）

## 概要

E2Eテスト完了後に適用するパッチ。
認証タブ（auth.tsx）のAlert表示を、顔登録タブと同じインラインカードUI方式に統一します。

---

## 変更内容

### 1. State追加（Line 62付近）

**追加位置**: `const [initError, setInitError] = useState<string | null>(null);` の直後

```typescript
const [recognitionResult, setRecognitionResult] = useState<{
  workerName: string;
  companyName: string;
  ccusId: string | null;
  action: "allow" | "warn" | "block";
  messages: string[];
  method: "FACE" | "QR";
} | null>(null);

const [recognitionError, setRecognitionError] = useState<string | null>(null);
```

---

### 2. `showResultAlert` 関数の置き換え（Line 506-537）

**現在のコード**:
```typescript
const showResultAlert = (worker: WorkerInfo, ruleResult: RuleResult, method: "FACE" | "QR") => {
  const methodText = method === "FACE" ? "顔認証" : "QRコード認証";

  if (ruleResult.action === "block") {
    // 入場不可
    Alert.alert(
      "入場不可",
      // ...
    );
    return;
  }

  // 認識成功
  const modeText = currentProject?.gateMode === "IN" ? "入場" : "退場";
  Alert.alert(
    `${modeText}登録完了`,
    // ...
  );
};
```

**置き換え後**:
```typescript
const showResultCard = (worker: WorkerInfo, ruleResult: RuleResult, method: "FACE" | "QR") => {
  setRecognitionResult({
    workerName: worker.name,
    companyName: worker.company,
    ccusId: worker.ccusId || null,
    action: ruleResult.action,
    messages: ruleResult.messages,
    method,
  });
  setRecognitionError(null);
};
```

---

### 3. `showResultAlert` → `showResultCard` への参照変更

**変更箇所**:
- Line 218: `showResultAlert(worker, ruleResult, method);` → `showResultCard(...)`
- Line 252: `showResultAlert(worker, ruleResult, method);` → `showResultCard(...)`

---

### 4. 認識失敗時のエラー処理（Line 382-386）

**現在のコード**:
```typescript
Alert.alert(
  "認識失敗",
  `顔が検出されましたが、登録された作業員とマッチしませんでした。\n\n信頼度: ${(result.confidence * 100).toFixed(1)}%`,
  [{ text: "OK" }]
);
```

**置き換え後**:
```typescript
setRecognitionResult(null);
setRecognitionError(
  `顔が検出されましたが、登録された作業員とマッチしませんでした。\n\n信頼度: ${(result.confidence * 100).toFixed(1)}%`
);
```

---

### 5. APIエラー処理（Line 405）

**現在のコード**:
```typescript
Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
```

**置き換え後**:
```typescript
setRecognitionResult(null);
setRecognitionError(errorMessage);
```

---

### 6. QRエラー処理（Line 493-497）

**現在のコード**:
```typescript
Alert.alert(
  "エラー",
  error instanceof Error ? error.message : "QRコードの読み取りに失敗しました",
  [{ text: "OK" }]
);
```

**置き換え後**:
```typescript
setRecognitionResult(null);
setRecognitionError(
  error instanceof Error ? error.message : "QRコードの読み取りに失敗しました"
);
```

---

### 7. その他のAlert削除

以下のAlertも削除（Line 264-269, 378）:
- 入場イベント記録失敗の警告Alert
- 作業員情報が見つからないAlert

これらも同様に `setRecognitionError()` に変更します。

---

### 8. JSX追加（Line 667付近、`</View>` の前）

**追加位置**: `{/* ボトムバー */}` の直後、`</View>` の前

```typescript
{/* 認識結果カード */}
{recognitionResult && (
  <View style={[
    styles.resultCard,
    recognitionResult.action === "allow" && styles.resultCardAllow,
    recognitionResult.action === "warn" && styles.resultCardWarn,
    recognitionResult.action === "block" && styles.resultCardBlock,
  ]}>
    <View style={styles.resultHeader}>
      <Ionicons
        name={
          recognitionResult.action === "allow"
            ? "checkmark-circle"
            : recognitionResult.action === "warn"
            ? "alert-circle"
            : "close-circle"
        }
        size={24}
        color={
          recognitionResult.action === "allow"
            ? "#0f766e"
            : recognitionResult.action === "warn"
            ? "#ca8a04"
            : "#b91c1c"
        }
      />
      <Text style={styles.resultTitle}>
        {recognitionResult.action === "allow"
          ? `${currentProject?.gateMode === "IN" ? "入場" : "退場"}登録完了`
          : recognitionResult.action === "warn"
          ? "注意が必要です"
          : "入場できません"}
      </Text>
    </View>
    <Text style={styles.resultWorker}>
      {recognitionResult.workerName}（{recognitionResult.companyName}）
    </Text>
    <Text style={styles.resultMethod}>
      認証方法: {recognitionResult.method === "FACE" ? "顔認証" : "QRコード認証"}
    </Text>
    {recognitionResult.ccusId && (
      <Text style={styles.resultCcusId}>CCUS ID: {recognitionResult.ccusId}</Text>
    )}
    {recognitionResult.messages.length > 0 && (
      <View style={styles.resultMessagesContainer}>
        {recognitionResult.messages.map((msgId, index) => (
          <Text key={index} style={styles.resultMessage}>
            {messagesJa[msgId as keyof typeof messagesJa] || msgId}
          </Text>
        ))}
      </View>
    )}
    {recognitionResult.action === "allow" && recognitionResult.messages.length === 0 && (
      <Text style={styles.resultSuccessMessage}>✅ 問題なく登録されました</Text>
    )}
    <TouchableOpacity
      style={styles.resultDismissButton}
      onPress={() => setRecognitionResult(null)}
    >
      <Text style={styles.resultDismissText}>閉じる</Text>
    </TouchableOpacity>
  </View>
)}

{/* エラーカード */}
{recognitionError && (
  <View style={styles.errorCard}>
    <View style={styles.errorHeader}>
      <Ionicons name="warning" size={24} color="#b91c1c" />
      <Text style={styles.errorTitle}>エラー</Text>
    </View>
    <Text style={styles.errorText}>{recognitionError}</Text>
    <TouchableOpacity
      style={styles.errorDismissButton}
      onPress={() => setRecognitionError(null)}
    >
      <Text style={styles.errorDismissText}>閉じる</Text>
    </TouchableOpacity>
  </View>
)}
```

---

### 9. Styles追加（Line 863付近、StyleSheet.create の中）

```typescript
// 認識結果カード
resultCard: {
  position: "absolute",
  bottom: 80,
  left: 16,
  right: 16,
  padding: 20,
  borderRadius: 12,
  backgroundColor: "#fff",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 8,
},

resultCardAllow: {
  borderLeftWidth: 4,
  borderLeftColor: "#0f766e",
},

resultCardWarn: {
  borderLeftWidth: 4,
  borderLeftColor: "#ca8a04",
},

resultCardBlock: {
  borderLeftWidth: 4,
  borderLeftColor: "#b91c1c",
},

resultHeader: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
},

resultTitle: {
  fontSize: 18,
  fontWeight: "bold",
  color: "#1f2937",
},

resultWorker: {
  fontSize: 16,
  fontWeight: "600",
  color: "#374151",
  marginBottom: 4,
},

resultMethod: {
  fontSize: 14,
  color: "#6b7280",
  marginBottom: 4,
},

resultCcusId: {
  fontSize: 14,
  color: "#6b7280",
  marginBottom: 8,
},

resultMessagesContainer: {
  marginTop: 8,
  padding: 12,
  backgroundColor: "#fef3c7",
  borderRadius: 8,
},

resultMessage: {
  fontSize: 14,
  color: "#92400e",
  lineHeight: 20,
},

resultSuccessMessage: {
  fontSize: 14,
  color: "#0f766e",
  marginTop: 8,
},

resultDismissButton: {
  marginTop: 16,
  paddingVertical: 10,
  paddingHorizontal: 16,
  backgroundColor: "#f3f4f6",
  borderRadius: 8,
  alignItems: "center",
},

resultDismissText: {
  fontSize: 14,
  fontWeight: "500",
  color: "#374151",
},

// エラーカード
errorCard: {
  position: "absolute",
  bottom: 80,
  left: 16,
  right: 16,
  padding: 20,
  borderRadius: 12,
  backgroundColor: "#fff",
  borderLeftWidth: 4,
  borderLeftColor: "#b91c1c",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 8,
},

errorHeader: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
},

errorTitle: {
  fontSize: 18,
  fontWeight: "bold",
  color: "#1f2937",
},

errorText: {
  fontSize: 14,
  color: "#b91c1c",
  lineHeight: 20,
},

errorDismissButton: {
  marginTop: 16,
  paddingVertical: 10,
  paddingHorizontal: 16,
  backgroundColor: "#fee2e2",
  borderRadius: 8,
  alignItems: "center",
},

errorDismissText: {
  fontSize: 14,
  fontWeight: "500",
  color: "#b91c1c",
},
```

---

## 適用手順

### ステップ1: バックアップ
```bash
cp apps/mobile/src/app/(tabs)/auth.tsx apps/mobile/src/app/(tabs)/auth.tsx.backup
```

### ステップ2: パッチ適用
上記の変更をauth.tsxに適用

### ステップ3: 型チェック
```bash
cd apps/mobile
npx tsc --noEmit
```

### ステップ4: コミット
```bash
git add apps/mobile/src/app/(tabs)/auth.tsx
git commit -m "UI: Option B適用 - 認証タブをカードUI方式に統一"
```

### ステップ5: 動作確認
- 認証タブでE2E_ALLOW, E2E_WARN, E2E_BLOCKの3パターンをテスト
- カードが正しく表示されることを確認
- 「閉じる」ボタンでカードが消えることを確認

---

## 期待される結果

### Before (Alert方式)
- 認証結果がAlertダイアログで表示される
- ユーザーはOKボタンを押すまで待つ必要がある
- 情報量が少ない

### After (カード方式)
- 認証結果が画面下部のカードで表示される
- カメラビューはそのまま見える
- 情報量が豊富（氏名、会社名、認証方法、CCUS ID、メッセージ）
- 「閉じる」ボタンで明示的に閉じる
- allow / warn / block で色分けされている

---

## 注意事項

1. **Alert.alert のimport削除は不要**
   - 権限要求やエラー表示で他の箇所でも使用しているため

2. **カードの位置調整**
   - `bottom: 80` は環境によって調整が必要かもしれません
   - 必要に応じて修正してください

3. **テスト項目**
   - シナリオ1（ALLOW）で緑色の左ボーダーが表示される
   - シナリオ2（WARN）で黄色の左ボーダーと警告メッセージが表示される
   - シナリオ3（BLOCK）で赤色の左ボーダーが表示される
   - 未登録顔でエラーカードが表示される

---

**作成日**: 2025-12-08
**作成者**: Claude (with user collaboration)
**ステータス**: E2Eテスト完了後に適用予定
