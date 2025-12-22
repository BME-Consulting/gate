# Production UX Failure Catalog

**最終更新**: 2025-12-22
**対象**: mc-gate Production 環境
**目的**: 本番環境で発生しうる UX 事故パターンを具体的に記録し、改善余地を可視化する

**重要な制約**:
- **Production Freeze 対象には一切触れない**（`docs/PRODUCTION_FREEZE.md` 参照）
- セキュリティ・認証ロジックの変更は禁止
- 改善は UI/文言/遷移のみ

---

## UX Failure Pattern 1: Token 期限切れ時の体験破壊

### 発生条件

1. ユーザーが正常にログインした状態でアプリを使用中
2. JWT Token が期限切れになる（デフォルト: Keycloak の token lifespan 設定による）
3. ユーザーが API を呼び出す操作を実行（例: 設定画面でワーカー取得、履歴取得）
4. API が 401 Unauthorized を返す

**発生確率**: 高（長時間アプリを起動したまま放置した場合、必ず発生）

### 現在の挙動（事実ベース）

**コード参照**: `apps/mobile/src/store/appStore.ts:129-142`, `apps/mobile/src/app/(tabs)/settings.tsx:136-154`

1. API リクエストが 401 を返す
2. `appStore.ts` の fetch 処理内で 401 を検知
3. **即座に `logout()` が呼ばれる** (appStore.ts:129-132)
4. 以下の状態変更が同期的に発生:
   - `isAuthenticated: false` に変更
   - `user: null` に変更
   - `SecureStore` から token 削除
5. **画面遷移なし** - ユーザーは現在の画面に留まる
6. 現在の画面（例: 設定画面）は `useEffect` で `isAuthenticated` を監視しているが、**再レンダリングが遅延する**
7. ユーザーが再度操作を試みると、「読み込み中...」などの中途半端な状態が表示される

**実コード**:
```typescript
// apps/mobile/src/store/appStore.ts:129-132
if (response.status === 401 || response.status === 403) {
  logout();
  throw new Error(`Authentication failed: ${response.status}`);
}

// apps/mobile/src/app/(tabs)/settings.tsx:49-58
useEffect(() => {
  if (!isAuthenticated) {
    router.replace("/");
    return;
  }
  loadWorkers();
}, [isAuthenticated, router]);
```

### ユーザーの認知上の問題点

1. **突然のログアウトに対する説明がない**
   - ユーザーは「何が起きたのか」「なぜログアウトされたのか」がわからない
   - エラーメッセージが表示されない（throw された Error はキャッチされない）

2. **現在の画面に留まる期間がある**
   - logout 後も設定画面などに数秒間留まる
   - その間、ボタンを押しても反応しない（isAuthenticated が false のため）
   - ユーザーは「アプリがフリーズした？」と誤認する

3. **ログイン画面への遷移が不明確**
   - `router.replace("/")` で遷移するが、タイミングが遅延する
   - ユーザーは「自分で何かしないといけないのか？」と迷う

4. **作業中のデータが失われる可能性**
   - 例: スキャン画面で顔認証中に 401 が発生した場合、スキャン状態が失われる
   - ユーザーは「もう一度やり直さないといけないのか？」という不安を感じる

### 改善余地（Freeze を破らない範囲）

**注意**: 以下は UI/文言/遷移の改善のみ。認証ロジック自体は変更しない。

#### 改善案 1: Toast メッセージで理由を明示

**変更箇所**: `apps/mobile/src/store/appStore.ts:129-132`

```typescript
// 変更前
if (response.status === 401 || response.status === 403) {
  logout();
  throw new Error(`Authentication failed: ${response.status}`);
}

// 変更後
if (response.status === 401 || response.status === 403) {
  // UI層で Toast 表示（ロジック変更なし）
  Alert.alert(
    "セッション期限切れ",
    "ログインの有効期限が切れました。再度ログインしてください。",
    [{ text: "OK" }]
  );
  logout();
  throw new Error(`Authentication failed: ${response.status}`);
}
```

**効果**:
- ユーザーは「なぜログアウトされたのか」を理解できる
- 「再度ログインすれば良い」ことが明確になる

#### 改善案 2: ログイン画面への即座の遷移

**変更箇所**: `apps/mobile/src/store/appStore.ts:129-142`

```typescript
// logout() 呼び出し後、即座にルーティング
import { router } from "expo-router";

if (response.status === 401 || response.status === 403) {
  Alert.alert(
    "セッション期限切れ",
    "ログインの有効期限が切れました。再度ログインしてください。",
    [{ text: "OK", onPress: () => router.replace("/") }]
  );
  logout();
  throw new Error(`Authentication failed: ${response.status}`);
}
```

**効果**:
- ユーザーが Alert の OK を押した瞬間にログイン画面に遷移
- 中途半端な状態で画面に留まる時間がなくなる

#### 改善案 3: ローディング状態の統一表示

**変更箇所**: 各画面コンポーネント（settings.tsx, history.tsx など）

```typescript
// ログアウト直後の useEffect で即座に遷移
useEffect(() => {
  if (!isAuthenticated) {
    // ローディング表示を挟まずに即座に遷移
    router.replace("/");
    return;
  }
  loadWorkers();
}, [isAuthenticated, router]);
```

**効果**:
- ログアウト後の「読み込み中...」表示が表示されない
- ユーザーは迷わずログイン画面に移動できる

---

## UX Failure Pattern 2: API 一時断時の体験破壊

### 発生条件

1. ユーザーがアプリを使用中
2. 以下のいずれかが発生:
   - ネットワーク切断（Wi-Fi/モバイル回線の断）
   - API サーバーが 502 Bad Gateway を返す
   - API リクエストがタイムアウトする（timeout 設定: なし or デフォルト値）

**発生確率**: 中〜高（モバイル環境では頻繁に発生）

### 現在の挙動（事実ベース）

**コード参照**: `apps/mobile/src/hooks/useWorkers.ts:45-68`, `apps/mobile/src/app/(tabs)/settings.tsx:136-154`

#### ケース A: ネットワーク切断時

1. `fetch()` が `TypeError: Network request failed` を throw
2. catch ブロックで `error` を catch
3. `Alert.alert()` でエラーメッセージを表示:
   ```
   エラー
   作業員の読み込みに失敗しました: Network request failed
   ```
4. **ユーザーは「どうすれば良いか」がわからない**

**実コード**:
```typescript
// apps/mobile/src/hooks/useWorkers.ts:60-67
} catch (error) {
  console.error("[useWorkers] Error loading workers:", error);
  Alert.alert(
    "エラー",
    `作業員の読み込みに失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`
  );
  setWorkers([]);
} finally {
  setLoading(false);
}
```

#### ケース B: API サーバーが 502 を返す場合

1. `fetch()` は成功するが、`response.status === 502`
2. **appStore.ts の共通処理では 502 を特別扱いしていない**
3. `response.json()` を実行しようとするが、JSON パースエラーが発生する可能性
4. catch ブロックで `Alert.alert()` が表示されるが、エラーメッセージが不明確

#### ケース C: タイムアウト時

1. `fetch()` がタイムアウト（デフォルト値: ブラウザ依存、通常 30〜60秒）
2. **30秒以上待たされる** - ユーザーは「アプリがフリーズした？」と誤認
3. 最終的に `TypeError: Network request failed` で catch される
4. ケース A と同じ挙動

### ユーザーの認知上の問題点

1. **エラーメッセージが技術的すぎる**
   - "Network request failed" → ユーザーは意味がわからない
   - "502 Bad Gateway" → ユーザーは意味がわからない

2. **どうすれば良いかのアクションが示されない**
   - 「再試行」ボタンがない
   - 「ネットワーク接続を確認してください」などのガイダンスがない

3. **タイムアウト時の待ち時間が長すぎる**
   - 30秒以上待たされると、ユーザーは「壊れた」と判断してアプリを再起動する

4. **ネットワーク復旧後も自動リトライしない**
   - ユーザーは手動で「再読み込み」ボタンを探さなければならない（存在しない場合もある）

### 改善余地（Freeze を破らない範囲）

#### 改善案 1: ユーザーフレンドリーなエラーメッセージ

**変更箇所**: `apps/mobile/src/hooks/useWorkers.ts:60-67`

```typescript
} catch (error) {
  console.error("[useWorkers] Error loading workers:", error);

  // エラーメッセージを user-friendly に変換
  let userMessage = "不明なエラー";
  if (error instanceof Error) {
    if (error.message.includes("Network request failed")) {
      userMessage = "ネットワーク接続を確認してください";
    } else if (error.message.includes("timeout")) {
      userMessage = "サーバーの応答が遅れています。しばらくしてから再試行してください。";
    } else {
      userMessage = error.message;
    }
  }

  Alert.alert(
    "読み込みエラー",
    `作業員の読み込みに失敗しました。\n\n${userMessage}`,
    [
      { text: "キャンセル", style: "cancel" },
      { text: "再試行", onPress: () => loadWorkers() }
    ]
  );
  setWorkers([]);
} finally {
  setLoading(false);
}
```

**効果**:
- ユーザーは「何が問題か」を理解できる
- 「再試行」ボタンで即座にリトライできる

#### 改善案 2: タイムアウト値の設定

**変更箇所**: `apps/mobile/src/store/appStore.ts` (fetch wrapper)

```typescript
// fetchWithTimeout を実装
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('リクエストがタイムアウトしました');
    }
    throw error;
  }
}
```

**効果**:
- 10秒でタイムアウトするため、ユーザーの待ち時間が短縮される
- エラーメッセージが「タイムアウト」と明確になる

#### 改善案 3: ネットワーク状態の監視と自動リトライ

**変更箇所**: 各画面コンポーネント

```typescript
import NetInfo from "@react-native-community/netinfo";

useEffect(() => {
  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected && workers.length === 0 && !loading) {
      // ネットワーク復旧時、自動リトライ
      loadWorkers();
    }
  });

  return () => unsubscribe();
}, [workers, loading]);
```

**効果**:
- ネットワーク復旧時、ユーザーが何もしなくても自動的にデータを取得
- ユーザー体験がスムーズになる

---

## UX Failure Pattern 3: プロジェクト 0 件時のユーザー心理的混乱

### 発生条件

1. ユーザーがログインに成功する
2. Keycloak の JWT に `resource_access["mc-gate-mobile"].roles` が存在しない、または空配列
3. バックエンド API が 403 Forbidden を返す、またはプロジェクト一覧が空配列を返す
4. 設定画面で「プロジェクト一覧」が空になる

**発生確率**: 中（新規ユーザー、または役割設定ミス時に発生）

### 現在の挙動（事実ベース）

**コード参照**: `apps/mobile/src/app/(tabs)/settings.tsx:75-127`

1. 設定画面で「プロジェクト」セクションが表示される
2. プロジェクト一覧が空の場合:
   ```tsx
   {projects.length > 0 ? (
     // プロジェクト一覧
   ) : (
     <Text style={styles.emptyText}>プロジェクトがありません</Text>
   )}
   ```
3. **「プロジェクトがありません」という文言が表示される**
4. **ユーザーは以下のように誤認する**:
   - 「プロジェクトが作成されていないのか？」
   - 「自分でプロジェクトを作成する必要があるのか？」
   - 「アプリが壊れているのか？」

**実コード**:
```typescript
// apps/mobile/src/app/(tabs)/settings.tsx:103-115
<View style={styles.section}>
  <Text style={styles.sectionTitle}>プロジェクト</Text>
  {projects.length > 0 ? (
    projects.map((project) => (
      <View key={project.id} style={styles.infoItem}>
        <Text style={styles.infoLabel}>{project.name}</Text>
      </View>
    ))
  ) : (
    <Text style={styles.emptyText}>プロジェクトがありません</Text>
  )}
</View>
```

### ユーザーの認知上の問題点

1. **「プロジェクトがありません」が曖昧**
   - システム全体にプロジェクトが存在しないのか？
   - 自分に割り当てられていないだけなのか？
   - 一時的なエラーなのか？

2. **次のアクションが示されない**
   - ユーザーは「どうすれば良いか」がわからない
   - 管理者に連絡すべきなのか？
   - 待てば良いのか？

3. **403 エラーと空配列の区別がない**
   - 403: 権限不足（管理者に連絡が必要）
   - 空配列: プロジェクトが存在しない（システムの問題）
   - これらを区別するUI がない

4. **ログインできたのにアプリが使えない矛盾**
   - ログインは成功した → ユーザーは「使える」と期待する
   - プロジェクトが 0 件 → ユーザーは「何もできない」と絶望する

### 改善余地（Freeze を破らない範囲）

#### 改善案 1: 状況に応じたメッセージの出し分け

**変更箇所**: `apps/mobile/src/app/(tabs)/settings.tsx:103-115`

```typescript
<View style={styles.section}>
  <Text style={styles.sectionTitle}>プロジェクト</Text>
  {projects.length > 0 ? (
    projects.map((project) => (
      <View key={project.id} style={styles.infoItem}>
        <Text style={styles.infoLabel}>{project.name}</Text>
      </View>
    ))
  ) : (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>プロジェクトが割り当てられていません</Text>
      <Text style={styles.emptyDescription}>
        管理者にプロジェクトへのアクセス権限を依頼してください。
      </Text>
      <Text style={styles.emptyContact}>
        お困りの場合は、システム管理者にお問い合わせください。
      </Text>
    </View>
  )}
</View>
```

**効果**:
- ユーザーは「管理者に連絡すれば良い」ことが明確になる
- 「自分の操作ミス」ではないことが理解できる

#### 改善案 2: エラー状態（403）の明示的な表示

**変更箇所**: `apps/mobile/src/hooks/useProjects.ts` (新規作成想定)

```typescript
const [projectsError, setProjectsError] = useState<string | null>(null);

try {
  const response = await fetch(...);
  if (response.status === 403) {
    setProjectsError("権限不足");
    setProjects([]);
    return;
  }
  // ...
} catch (error) {
  setProjectsError("通信エラー");
}

// 設定画面で使用
{projectsError === "権限不足" ? (
  <Text style={styles.errorText}>
    プロジェクトへのアクセス権限がありません。管理者にお問い合わせください。
  </Text>
) : projectsError === "通信エラー" ? (
  <Text style={styles.errorText}>
    ネットワークエラーが発生しました。再試行してください。
  </Text>
) : (
  <Text style={styles.emptyText}>プロジェクトがありません</Text>
)}
```

**効果**:
- 403 と空配列を明確に区別できる
- ユーザーは適切なアクションを取れる

#### 改善案 3: プロジェクト 0 件時のアプリ利用制限の明示

**変更箇所**: `apps/mobile/src/app/(tabs)/home.tsx` など

```typescript
// ホーム画面で「プロジェクトなし」状態を検知
useEffect(() => {
  if (isAuthenticated && projects.length === 0) {
    // ホーム画面に警告メッセージを表示
    Alert.alert(
      "プロジェクト未割り当て",
      "現在、プロジェクトが割り当てられていません。\n管理者にアクセス権限を依頼してください。",
      [{ text: "OK" }]
    );
  }
}, [isAuthenticated, projects]);
```

**効果**:
- ログイン直後にユーザーに状況を伝える
- ユーザーは「なぜ使えないのか」を即座に理解できる

---

## UX Failure Pattern 4: 初回ログイン直後のローディング体験の破壊

### 発生条件

1. ユーザーが初めてアプリを起動し、ログインする
2. ログイン成功後、以下の処理が並列または順次実行される:
   - ワーカー一覧の取得
   - プロジェクト一覧の取得
   - スキャン履歴の取得（ローカル SQLite）
   - 同期キューのカウント取得

**発生確率**: 高（すべてのユーザーが初回ログイン時に経験）

### 現在の挙動（事実ベース）

**コード参照**: `apps/mobile/src/app/(tabs)/settings.tsx:49-58`, `apps/mobile/src/app/(tabs)/history.tsx:56-69`

1. ログイン成功後、各タブが mount される
2. 各タブの `useEffect` が実行され、API リクエストが並列に発行される:
   - 設定タブ: ワーカー取得 (`useWorkers`)
   - 履歴タブ: 履歴取得 (`useHistory`)
   - ホームタブ: プロジェクト情報取得
3. **各タブで個別にローディング表示が行われる**:
   ```tsx
   {loading ? (
     <ActivityIndicator size="large" color="#007AFF" />
   ) : (
     // コンテンツ
   )}
   ```
4. **ユーザー体験**:
   - ログイン直後、ホーム画面が表示される
   - 他のタブに移動すると、**再度ローディングが表示される**
   - ユーザーは「なぜまた読み込んでいるのか？」と混乱する

**実コード**:
```typescript
// apps/mobile/src/app/(tabs)/settings.tsx:49-58
useEffect(() => {
  if (!isAuthenticated) {
    router.replace("/");
    return;
  }
  loadWorkers(); // 設定タブ mount 時に実行
}, [isAuthenticated, router]);

// apps/mobile/src/app/(tabs)/history.tsx:56-69
useEffect(() => {
  if (!isAuthenticated) {
    router.replace("/");
    return;
  }
  loadHistory(); // 履歴タブ mount 時に実行
}, [isAuthenticated, router]);
```

### ユーザーの認知上の問題点

1. **ローディングが複数回表示される**
   - ログイン直後: ホーム画面のローディング
   - 設定タブに移動: 設定画面のローディング
   - 履歴タブに移動: 履歴画面のローディング
   - ユーザーは「なぜ何度も待たされるのか？」と不満を感じる

2. **全体のローディング状態が不明確**
   - 「アプリ全体の初期化」がいつ完了するのかわからない
   - 「すべてのデータが揃った」タイミングが明示されない

3. **タブ切り替え時の待ち時間**
   - 初回タブ切り替え時に毎回ローディングが表示される
   - ユーザーは「データが事前に取得されていない」ことに気づき、不満を感じる

4. **ネットワーク遅延時の体験悪化**
   - API レスポンスが遅い場合、各タブで 5〜10秒待たされる
   - ユーザーは「アプリが遅い」と判断し、離脱する

### 改善余地（Freeze を破らない範囲）

#### 改善案 1: ログイン直後の一括プリフェッチ

**変更箇所**: `apps/mobile/src/app/(tabs)/_layout.tsx` または `apps/mobile/src/app/index.tsx`

```typescript
// ログイン成功直後に全データをプリフェッチ
useEffect(() => {
  if (isAuthenticated) {
    // 全タブで必要なデータを並列取得
    Promise.all([
      loadWorkers(),
      loadProjects(),
      loadHistory()
    ]).then(() => {
      console.log("Initial data loading complete");
    }).catch(error => {
      console.error("Initial data loading failed:", error);
    });
  }
}, [isAuthenticated]);
```

**効果**:
- タブ切り替え時にローディングが表示されない
- ユーザーは「アプリが高速」と感じる

#### 改善案 2: 全体ローディング画面の表示

**変更箇所**: `apps/mobile/src/app/(tabs)/_layout.tsx`

```typescript
const [isInitializing, setIsInitializing] = useState(false);

useEffect(() => {
  if (isAuthenticated) {
    setIsInitializing(true);
    Promise.all([
      loadWorkers(),
      loadProjects(),
      loadHistory()
    ]).finally(() => {
      setIsInitializing(false);
    });
  }
}, [isAuthenticated]);

// レンダリング
{isInitializing ? (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007AFF" />
    <Text style={styles.loadingText}>データを読み込んでいます...</Text>
  </View>
) : (
  <Tabs>
    {/* タブ定義 */}
  </Tabs>
)}
```

**効果**:
- ユーザーは「アプリが初期化中」であることを明確に理解できる
- 初期化完了後は、すべてのタブが即座に表示される

#### 改善案 3: Progressive Loading（段階的ローディング）

**変更箇所**: 各タブコンポーネント

```typescript
// キャッシュされたデータがあればすぐ表示、なければローディング
const [cachedData, setCachedData] = useState<Data | null>(null);

useEffect(() => {
  // キャッシュから即座に表示
  const cached = getCachedData();
  if (cached) {
    setCachedData(cached);
  }

  // バックグラウンドで最新データを取得
  loadData().then(freshData => {
    setCachedData(freshData);
    saveCacheData(freshData);
  });
}, []);

// レンダリング
{cachedData ? (
  <DataList data={cachedData} />
) : (
  <ActivityIndicator size="large" />
)}
```

**効果**:
- 2回目以降のアプリ起動時、即座にデータが表示される
- ユーザーは「アプリが高速」と感じる

---

## UX Failure Pattern 5: 再ログイン時の state 復元失敗

### 発生条件

1. ユーザーがアプリを使用中（例: 履歴タブを閲覧中）
2. Token 期限切れ or 手動ログアウト
3. 再度ログインする
4. ログイン成功後、**前回の画面状態が復元されない**

**発生確率**: 高（再ログインが発生するたびに経験）

### 現在の挙動（事実ベース）

**コード参照**: `apps/mobile/src/app/index.tsx:22-40`, `apps/mobile/src/app/(tabs)/settings.tsx:49-58`

1. ログアウト時:
   - `logout()` が呼ばれ、`isAuthenticated: false` に変更される (appStore.ts)
   - 各画面の `useEffect` で `router.replace("/")` が実行される
   - **画面状態（スクロール位置、選択中のプロジェクト、入力中のテキストなど）が失われる**

2. 再ログイン時:
   - `login()` が呼ばれ、`isAuthenticated: true` に変更される
   - `apps/mobile/src/app/index.tsx` の `useEffect` で `router.replace("/(tabs)/home")` が実行される
   - **常にホーム画面に遷移する** - 前回の画面位置が復元されない

**実コード**:
```typescript
// apps/mobile/src/app/index.tsx:22-40
useEffect(() => {
  if (isAuthenticated) {
    router.replace("/(tabs)/home"); // 常にホーム画面に遷移
  }
}, [isAuthenticated, router]);

// apps/mobile/src/app/(tabs)/settings.tsx:49-58
useEffect(() => {
  if (!isAuthenticated) {
    router.replace("/"); // ログアウト時にログイン画面に遷移
    return;
  }
  loadWorkers();
}, [isAuthenticated, router]);
```

### ユーザーの認知上の問題点

1. **前回の作業位置が失われる**
   - 例: 履歴タブで 100 件中 50 件目を閲覧中に Token 期限切れ
   - 再ログイン後、ホーム画面に戻される
   - ユーザーは「また履歴タブを開いて、スクロールし直さないといけない」と不満を感じる

2. **入力中のデータが失われる**
   - 例: スキャン画面で顔認証中に Token 期限切れ（可能性は低いが、発生しうる）
   - 再ログイン後、スキャン状態が失われる
   - ユーザーは「もう一度やり直さないといけない」と不満を感じる

3. **ログイン前後でコンテキストが断絶**
   - ユーザーは「ログイン前に何をしていたか」を覚えていない
   - 「次に何をすべきか」を再度考えなければならない

4. **頻繁な再ログインが発生する場合、UX 破壊が累積**
   - Token lifespan が短い場合（例: 15分）、1日に複数回再ログインが発生する
   - そのたびに作業位置が失われるため、ユーザーは極度の不満を感じる

### 改善余地（Freeze を破らない範囲）

#### 改善案 1: 前回の画面位置を記憶して復元

**変更箇所**: `apps/mobile/src/app/index.tsx`, `apps/mobile/src/store/appStore.ts`

```typescript
// appStore.ts に lastRoute を追加
interface AppState {
  // ...
  lastRoute: string | null; // 最後にアクセスしたルート
}

const setLastRoute = (route: string) => {
  set({ lastRoute: route });
};

// 各画面の useEffect で lastRoute を記録
useEffect(() => {
  setLastRoute("/(tabs)/settings"); // 設定画面にアクセスしたことを記録
}, []);

// index.tsx で復元
useEffect(() => {
  if (isAuthenticated) {
    const lastRoute = useAppStore.getState().lastRoute;
    if (lastRoute) {
      router.replace(lastRoute); // 前回のルートに復元
    } else {
      router.replace("/(tabs)/home"); // デフォルトはホーム画面
    }
  }
}, [isAuthenticated, router]);
```

**効果**:
- 再ログイン後、前回の画面位置に自動的に戻る
- ユーザーは「作業の継続性」を感じる

#### 改善案 2: 画面状態（スクロール位置など）の永続化

**変更箇所**: 各タブコンポーネント（history.tsx など）

```typescript
// AsyncStorage で スクロール位置を保存
import AsyncStorage from "@react-native-async-storage/async-storage";

const [scrollOffset, setScrollOffset] = useState(0);

// スクロール時に保存
const handleScroll = (event) => {
  const offset = event.nativeEvent.contentOffset.y;
  setScrollOffset(offset);
  AsyncStorage.setItem("history_scroll_offset", String(offset));
};

// mount 時に復元
useEffect(() => {
  AsyncStorage.getItem("history_scroll_offset").then(offset => {
    if (offset) {
      setScrollOffset(Number(offset));
      // FlatList の scrollToOffset で復元
    }
  });
}, []);
```

**効果**:
- 再ログイン後、スクロール位置が復元される
- ユーザーは「前回の続きから作業できる」と感じる

#### 改善案 3: ログアウト前に確認ダイアログを表示

**変更箇所**: `apps/mobile/src/store/appStore.ts` の `logout()` 関数

```typescript
const logout = async () => {
  // 現在の画面状態を確認
  const hasUnsavedChanges = false; // 実際は state から判定

  if (hasUnsavedChanges) {
    // ログアウト前に確認
    Alert.alert(
      "ログアウト確認",
      "作業中のデータがあります。ログアウトしますか？",
      [
        { text: "キャンセル", style: "cancel" },
        { text: "ログアウト", style: "destructive", onPress: () => performLogout() }
      ]
    );
  } else {
    performLogout();
  }
};

const performLogout = async () => {
  set({ isAuthenticated: false, user: null });
  await SecureStore.deleteItemAsync("authToken");
  router.replace("/");
};
```

**効果**:
- ユーザーは「本当にログアウトして良いか」を判断できる
- 誤操作によるログアウトを防止できる

---

## 改善優先度マトリックス

各 UX Failure Pattern の改善優先度を以下の基準で評価:

| Pattern | 発生頻度 | 影響度 | 実装難易度 | 優先度 |
|---------|---------|--------|-----------|--------|
| **1. Token 期限切れ** | 高 | 高 | 低 | **🔴 最優先** |
| **2. API 一時断** | 中〜高 | 高 | 中 | **🟠 高** |
| **3. プロジェクト 0 件** | 中 | 中 | 低 | **🟡 中** |
| **4. 初回ローディング** | 高 | 中 | 中 | **🟠 高** |
| **5. 再ログイン state 復元** | 高 | 中 | 高 | **🟡 中** |

### 優先度の理由

**Pattern 1: Token 期限切れ** (最優先)
- すべてのユーザーが必ず経験する
- 現在の挙動（即座にログアウト、説明なし）が最悪
- 実装難易度が低い（Alert.alert の追加のみ）

**Pattern 2: API 一時断** (高優先度)
- モバイル環境では頻繁に発生
- エラーメッセージが技術的すぎる
- 実装難易度が中程度（タイムアウト実装、エラーメッセージ改善）

**Pattern 4: 初回ローディング** (高優先度)
- すべてのユーザーが初回ログイン時に経験
- 複数回のローディングが UX を著しく悪化させる
- 実装難易度が中程度（プリフェッチ実装）

**Pattern 3: プロジェクト 0 件** (中優先度)
- 発生頻度は中程度（新規ユーザー、設定ミス時）
- メッセージ改善のみで対応可能（実装難易度: 低）

**Pattern 5: 再ログイン state 復元** (中優先度)
- 発生頻度は高いが、回避策がある（すぐに再操作すれば良い）
- 実装難易度が高い（lastRoute, scroll offset の永続化）

---

## 次のステップ

1. **Pattern 1 の改善を最優先で実施**（次の Step で実装予定）
2. **Pattern 2, 4 の改善を順次実施**
3. **Pattern 3, 5 は余裕があれば実施**

**重要**: すべての改善は **Production Freeze を破らない** 範囲で実施する。
- セキュリティ・認証ロジックは変更しない
- UI/文言/遷移のみの改善に留める
- Drift Detection で検知されないことを確認する

---

## 関連ドキュメント

- **Production Freeze**: `docs/PRODUCTION_FREEZE.md`
- **Incident Response Runbook**: `docs/runbooks/production-incident-response.md`
- **Security Policy**: `docs/SECURITY_POLICY_UI.md`
- **Mobile Auth Boundary**: `docs/security/mobile-auth-boundary.md`

---

**このドキュメントは継続的に更新される。新しい UX Failure Pattern を発見したら、必ず追記すること。**
