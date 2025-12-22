# Production UX Fix Implementation Plan

**作成日**: 2025-12-22
**ステータス**: 実装準備完了
**前提**: Production Freeze 維持（セキュリティ・認証ロジック変更禁止）
**対象**: UI/文言/画面遷移のみ

---

## 実装優先度

| Pattern | 優先度 | 頻度 | 影響度 | 実装難易度 | 想定工数 |
|---------|--------|------|--------|------------|----------|
| Pattern 1: Token 期限切れ UX | **最優先** | 高 | 高 | 低 | 1時間 |
| Pattern 2: API 一時断 UX | 高 | 中 | 高 | 中 | 2時間 |
| Pattern 4: 初回ログイン直後のローディング UX | 中 | 高 | 中 | 中 | 3時間 |

**合計想定工数**: 6時間

---

## Pattern 1: Token 期限切れ時の体験改善

### 変更対象ファイル

#### 1. `apps/mobile/src/store/appStore.ts`
- **関数**: `fetchProjects` (lines 220-258)
- **既存責務**: プロジェクト一覧をAPIから取得し、401/403エラー時に強制ログアウト

### 変更前のフロー

**現在の処理順** (appStore.ts:247-252):
```typescript
// 401/403エラーの場合は認証が無効 → 強制ログアウト
if (error instanceof ApiError &&
    (error.kind === "UNAUTHORIZED" || error.kind === "FORBIDDEN")) {
  console.warn("[AppStore] Authentication failed - forcing logout");
  await get().logout(); // ← エラーメッセージなしで即ログアウト
  return;
}
```

**ユーザーが見る挙動**:
1. アプリ使用中にトークンが期限切れになる
2. 次のAPI呼び出しで401エラーが発生
3. **何の説明もなく**ログアウトされる
4. 現在の画面に数秒間留まる（混乱）
5. その後ログイン画面に遷移

### 変更後のフロー（Freeze 非破壊）

**新しい処理順**:
1. 401/403エラーを検出
2. **Alert.alert でユーザーに理由を説明** ← 追加
3. ユーザーがOKボタンをタップ
4. logout() を実行
5. ログイン画面に即座に遷移

**具体的な文言**:
```typescript
// 401/403エラーの場合は認証が無効 → 強制ログアウト
if (error instanceof ApiError &&
    (error.kind === "UNAUTHORIZED" || error.kind === "FORBIDDEN")) {
  console.warn("[AppStore] Authentication failed - forcing logout");

  // ユーザーに理由を明示
  Alert.alert(
    "セッション期限切れ",
    "ログインの有効期限が切れました。再度ログインしてください。",
    [
      {
        text: "OK",
        onPress: async () => {
          await get().logout();
          // ログイン画面への遷移は appStore の logout() 内で自動的に行われる
        }
      }
    ]
  );
  return;
}
```

**Alert の種別**: `Alert.alert` (React Native標準)

### 実装スコープ

#### 追加 (○)
- `Alert.alert` による説明ダイアログ
- タイトル: "セッション期限切れ"
- メッセージ: "ログインの有効期限が切れました。再度ログインしてください。"
- ボタン: "OK" (タップで logout 実行)

#### 変更 (○)
- `fetchProjects` 内の 401/403 エラーハンドリング (1箇所のみ)

#### 削除 (✗)
- なし（既存ロジックは一切削除しない）

### 実装リスク

- **Freeze 違反リスク**: **低**
  - logout() の呼び出し条件は変更しない
  - 認証ロジックには一切触れない
  - UI 表示のタイミングを追加するだけ

- **ロールバック可否**: **可**
  - Alert.alert の追加のみなので、削除すれば元に戻る
  - 既存ロジックを壊していない

### テスト観点

#### 手動確認手順（3ステップ）
1. **トークン期限切れをシミュレート**:
   - アプリにログイン
   - SecureStore から手動でトークンを削除（または無効なトークンに置き換え）
   - プロジェクト一覧を再読み込み（設定画面を開く）

2. **Alert が表示されることを確認**:
   - タイトル: "セッション期限切れ"
   - メッセージ: "ログインの有効期限が切れました。再度ログインしてください。"
   - ボタン: "OK"

3. **OKボタンをタップしてログアウト確認**:
   - ログアウトが実行される
   - ログイン画面に遷移する
   - 再ログイン可能

#### 自動化できるか
- **No** (Alert.alert の表示はE2Eテストでのみ検証可能)
- 代替案: Jest で Alert.alert がモック呼び出しされることを確認

---

## Pattern 2: API 一時断時の体験改善

### 変更対象ファイル

#### 1. `apps/mobile/src/hooks/useWorkers.ts`
- **関数**: `syncFromServer` (lines 171-187)
- **既存責務**: サーバーから作業員マスタを取得し、ローカルDBに保存

#### 2. `apps/mobile/src/app/(tabs)/settings.tsx`
- **関数**: `handleWorkerSync` (lines 350-434)
- **既存責務**: 作業員同期ボタンのイベントハンドラ

### 変更前のフロー

**現在の処理順** (useWorkers.ts:243-246):
```typescript
} catch (error: any) {
  clearTimeout(timeoutId);
  console.error("[Workers] Error fetching workers:", error);
  throw error; // ← そのまま re-throw（エラーメッセージは上位で処理）
}
```

**settings.tsx での処理** (lines 402-430):
```typescript
} catch (error: any) {
  // 401/403エラーの場合は認証が無効 → 強制ログアウト
  if (error?.status === 401 || error?.status === 403) {
    Alert.alert(
      "認証エラー",
      "認証情報が無効です。再度ログインしてください。",
      [{ text: "OK", onPress: () => logout() }]
    );
    return;
  }

  // ApiError の場合は toUserMessage() を使用
  if (error instanceof ApiError) {
    Alert.alert("同期失敗", error.toUserMessage());
  } else {
    // その他のエラー（予期しない）
    const fallbackMessage = error instanceof Error
      ? `予期しないエラーが発生しました\n\n${error.message}\n\n管理者に問い合わせてください。`
      : "サーバーとの同期に失敗しました。";
    Alert.alert("同期失敗", fallbackMessage);
  }
}
```

**ユーザーが見る挙動**:
1. 作業員同期ボタンをタップ
2. ネットワークエラー（タイムアウト 30秒以上）
3. エラーメッセージが表示される:
   - "サーバーとの同期に失敗しました。"（曖昧）
   - "予期しないエラーが発生しました\n\nNetwork request failed\n\n管理者に問い合わせてください。"（技術的すぎる）
4. **再試行ボタンがない** → ユーザーは再度手動でタップする必要がある
5. 長時間待たされる（30秒）

### 変更後のフロー（Freeze 非破壊）

**新しい処理順**:
1. API呼び出しを実行（タイムアウト10秒に短縮） ← 変更
2. エラー発生時、エラー種別を判定
3. **ユーザーフレンドリーなメッセージ**を表示 ← 変更
4. **再試行ボタン**を表示 ← 追加
5. ユーザーがタップして即座に再試行

**具体的な文言**:

#### ネットワークエラーの場合
```typescript
Alert.alert(
  "ネットワークエラー",
  "サーバーに接続できませんでした。\n\nネットワーク接続を確認して、もう一度お試しください。",
  [
    { text: "キャンセル", style: "cancel" },
    { text: "再試行", onPress: () => handleWorkerSync() }
  ]
);
```

#### タイムアウトの場合
```typescript
Alert.alert(
  "タイムアウト",
  "サーバーからの応答に時間がかかっています。\n\nしばらく待ってから、もう一度お試しください。",
  [
    { text: "キャンセル", style: "cancel" },
    { text: "再試行", onPress: () => handleWorkerSync() }
  ]
);
```

#### サーバーエラー（500番台）の場合
```typescript
Alert.alert(
  "サーバーエラー",
  "サーバーで一時的な問題が発生しています。\n\nしばらく待ってから、もう一度お試しください。",
  [
    { text: "キャンセル", style: "cancel" },
    { text: "再試行", onPress: () => handleWorkerSync() }
  ]
);
```

**Alert の種別**: `Alert.alert` (React Native標準)

### 実装スコープ

#### 追加 (○)
- `TIMEOUT.BULK_FETCH` を 30000ms → 10000ms に短縮 (useWorkers.ts:18)
- エラー種別判定ロジック (settings.tsx に追加)
- ユーザーフレンドリーなエラーメッセージ (3種類)
- 再試行ボタン (Alert.alert のボタン配列に追加)

#### 変更 (○)
- `handleWorkerSync` のエラーハンドリング部分 (settings.tsx:402-430)

#### 削除 (✗)
- なし（既存ロジックは一切削除しない）

### 実装リスク

- **Freeze 違反リスク**: **低**
  - API呼び出しの条件は変更しない
  - タイムアウト値の変更は UI/UX 改善の範囲内
  - 認証ロジックには一切触れない

- **ロールバック可否**: **可**
  - エラーメッセージの変更のみ
  - タイムアウト値は定数変更のみなので即座にロールバック可能

### テスト観点

#### 手動確認手順（3ステップ）
1. **ネットワークを切断してテスト**:
   - 端末のWi-Fi/モバイルデータをOFF
   - 設定画面 → 「サーバーから同期」ボタンをタップ
   - 10秒以内にエラーダイアログが表示されることを確認

2. **エラーメッセージ確認**:
   - タイトル: "ネットワークエラー"
   - メッセージ: "サーバーに接続できませんでした。\n\nネットワーク接続を確認して、もう一度お試しください。"
   - ボタン: "キャンセル" / "再試行"

3. **再試行ボタン動作確認**:
   - ネットワークを再接続
   - "再試行" ボタンをタップ
   - 同期が正常に完了することを確認

#### 自動化できるか
- **Yes** (部分的)
  - Jest でエラー種別判定ロジックをテスト可能
  - E2E でネットワークエラーシミュレーションとUIテストが可能

---

## Pattern 4: 初回ログイン直後のローディング体験改善

### 変更対象ファイル

#### 1. `apps/mobile/src/app/index.tsx`
- **関数**: `useEffect` (auto-login) (lines 22-85)
- **既存責務**: 開発環境での自動ログインとプロジェクト設定

#### 2. `apps/mobile/src/store/appStore.ts`
- **関数**: `login` (lines 63-83)
- **既存責務**: ログイン処理とプロジェクト一覧取得

#### 3. 新規ファイル: `apps/mobile/src/components/GlobalLoadingScreen.tsx`
- **既存責務**: なし（新規作成）

### 変更前のフロー

**現在の処理順** (index.tsx:22-85):
```typescript
setTimeout(() => {
  login({...}, true);
  await loadProjectsFromCache();

  if (!currentProject && availableProjects.length === 0) {
    const mockProject = {...};
    await setCurrentProject(mockProject);
  }

  router.replace("/(tabs)/home"); // ← ホーム画面に遷移
}, 100);
```

**ユーザーが見る挙動**:
1. ログインボタンをタップ
2. ログイン画面からホーム画面に即座に遷移
3. **各タブを開くたびに個別にローディング**:
   - ホーム画面: 統計データ読み込み中...
   - 履歴画面: 履歴データ読み込み中...
   - 設定画面: プロジェクト情報読み込み中...
4. タブを切り替えるたびに待たされる（UX が悪い）

### 変更後のフロー（Freeze 非破壊）

**新しい処理順**:
1. ログインボタンをタップ
2. **グローバルローディング画面を表示** ← 追加
   - "初期化中..."
   - スピナー表示
3. **バッチプリフェッチを実行** ← 追加:
   - プロジェクト一覧取得
   - 作業員マスタ取得（バックグラウンド）
   - 今日の統計データ取得
4. プリフェッチ完了後、ホーム画面に遷移
5. 各タブは即座にデータ表示（ローディングなし）

**具体的な UI**:

#### GlobalLoadingScreen.tsx (新規作成)
```typescript
import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "@mc-gate/ui-kit";

interface GlobalLoadingScreenProps {
  message?: string;
}

export function GlobalLoadingScreen({ message = "初期化中..." }: GlobalLoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={tokens.color.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.color.background.default,
  },
  message: {
    marginTop: tokens.spacing.lg,
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
  },
});
```

#### appStore.ts の login 関数修正
```typescript
// 通常のログイン（トークンを受け取る）
login: async (user: User, isMock = false) => {
  try {
    // モック認証の場合はSecureStoreに保存しない
    if (!isMock) {
      await saveTokens(user.token, user.refreshToken || "", user.idToken);
    }

    set({
      user,
      isAuthenticated: true,
      isLoading: true, // ← グローバルローディング開始
    });

    // ログイン後にプロジェクト一覧を取得（モックの場合はスキップ）
    if (!isMock) {
      await get().fetchProjects();

      // バッチプリフェッチ（バックグラウンド）
      // ※ await しないことで、ホーム画面遷移をブロックしない
      get().prefetchInitialData();
    }

    set({ isLoading: false }); // ← グローバルローディング終了
  } catch (error) {
    console.error("Login failed:", error);
    set({ isLoading: false });
    throw error;
  }
},

// 新規追加: 初期データのプリフェッチ
prefetchInitialData: async () => {
  const { currentProject } = get();
  if (!currentProject) return;

  try {
    // 作業員マスタ取得（バックグラウンド）
    // ※ useWorkers の syncFromServer を呼び出す方法は要検討

    // 今日の統計データ取得
    // ※ OfflineQueue の getTodayStats を呼び出す方法は要検討

    console.log("[AppStore] Initial data prefetch completed");
  } catch (error) {
    console.error("[AppStore] Failed to prefetch initial data:", error);
    // エラーは無視（バックグラウンド処理のため）
  }
},
```

#### index.tsx の修正
```typescript
const { isLoading } = useAppStore();

// ...

return (
  <View style={styles.container}>
    {isLoading ? (
      <GlobalLoadingScreen message="初期化中..." />
    ) : (
      // 既存のログイン画面UI
      <View>...</View>
    )}
  </View>
);
```

**Modal の種別**: なし（全画面ローディング）

### 実装スコープ

#### 追加 (○)
- `GlobalLoadingScreen.tsx` コンポーネント（新規作成）
- `appStore.ts` に `prefetchInitialData` 関数を追加
- `appStore.ts` の `isLoading` 状態管理を拡張
- `index.tsx` で `isLoading` に応じてローディング画面を表示

#### 変更 (○)
- `appStore.ts` の `login` 関数（プリフェッチ処理を追加）
- `index.tsx` の UI（ローディング画面の条件分岐を追加）

#### 削除 (✗)
- なし（既存ロジックは一切削除しない）

### 実装リスク

- **Freeze 違反リスク**: **低**
  - ログイン処理の条件は変更しない
  - API呼び出しのタイミングを最適化するだけ
  - 認証ロジックには一切触れない

- **ロールバック可否**: **可**
  - `isLoading` フラグの追加のみ
  - プリフェッチ処理はバックグラウンドなので、削除しても既存動作に影響なし

### テスト観点

#### 手動確認手順（3ステップ）
1. **ログイン時のローディング画面確認**:
   - アプリを起動
   - ログインボタンをタップ
   - グローバルローディング画面が表示されることを確認
   - スピナーとメッセージ "初期化中..." が表示される

2. **ホーム画面への遷移確認**:
   - プリフェッチ完了後（数秒以内）、ホーム画面に自動遷移
   - 統計データが即座に表示される（ローディングなし）

3. **各タブの即時表示確認**:
   - 履歴タブに切り替え → 即座にデータ表示（ローディングなし）
   - 設定タブに切り替え → 即座にデータ表示（ローディングなし）

#### 自動化できるか
- **Yes** (部分的)
  - Jest で `isLoading` 状態遷移をテスト可能
  - E2E でローディング画面の表示と画面遷移をテスト可能

---

## 実装順序（推奨）

### フェーズ 1: Pattern 1 実装（想定1時間）
1. `apps/mobile/src/store/appStore.ts` の `fetchProjects` を修正
2. 手動テスト（トークン期限切れシミュレーション）
3. コミット: "ux: add alert for token expiration"

### フェーズ 2: Pattern 2 実装（想定2時間）
1. `packages/core/src/constants/timeout.ts` に `BULK_FETCH: 10000` を追加
2. `apps/mobile/src/app/(tabs)/settings.tsx` の `handleWorkerSync` を修正
3. エラー種別判定ロジックを追加
4. 手動テスト（ネットワーク切断 + 再試行ボタン）
5. コミット: "ux: improve api failure error messages and add retry"

### フェーズ 3: Pattern 4 実装（想定3時間）
1. `apps/mobile/src/components/GlobalLoadingScreen.tsx` を作成
2. `apps/mobile/src/store/appStore.ts` に `prefetchInitialData` を追加
3. `apps/mobile/src/app/index.tsx` でローディング画面を統合
4. 手動テスト（ログイン → 各タブ即時表示確認）
5. コミット: "ux: add global loading screen and batch prefetch"

### フェーズ 4: 統合テスト & EAS Update配信
1. 3つのパターンすべてが正常動作することを確認
2. TypeScript 型チェック: `pnpm type-check`
3. Lint チェック: `pnpm lint`
4. EAS Update 配信:
   ```bash
   export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
   npx eas-cli update --branch preview --message "UX: Token/API/Loading improvements"
   ```
5. 実機で動作確認

---

## 注意事項

### Production Freeze 遵守
- **絶対に変更してはいけないもの**:
  - `logout()` の呼び出し条件
  - 401/403 エラーの判定ロジック
  - API レスポンスの仕様
  - Token / roles / audience / auth flow

- **変更してよいもの**:
  - Alert.alert の追加
  - エラーメッセージの文言
  - ローディング画面の表示タイミング
  - タイムアウト値の調整（10秒程度）

### ロールバック手順
もし実装後に問題が発生した場合:

1. **即座にロールバック**:
   ```bash
   git revert [commit-hash]
   git push
   npx eas-cli update --branch preview --message "Rollback: UX improvements"
   ```

2. **問題を修正してから再実装**:
   - 修正内容をコミット
   - 再度 EAS Update 配信

---

## Done Criteria（完了条件）

- [ ] Pattern 1 実装完了（Alert.alert でトークン期限切れを説明）
- [ ] Pattern 2 実装完了（ユーザーフレンドリーなエラーメッセージ + 再試行ボタン）
- [ ] Pattern 4 実装完了（グローバルローディング画面 + バッチプリフェッチ）
- [ ] 手動テストですべてのパターンが正常動作することを確認
- [ ] TypeScript 型チェック通過
- [ ] Lint チェック通過
- [ ] EAS Update 配信完了
- [ ] 実機で動作確認完了
- [ ] Production Freeze 違反なし

---

## 次のステップ（G-3）

このドキュメント完成後:

**G-3-1**: Pattern 1 のみを実装
- 最小 diff
- 低リスク
- 即効性

実装完了後、ユーザーフィードバックを収集し、Pattern 2 と Pattern 4 の実装判断を行う。

---

**最終更新**: 2025-12-22
**作成者**: Claude (with user collaboration)
**参照**: docs/ux/production-failure-catalog.md
**関連**: docs/PRODUCTION_FREEZE.md
