# Android起動クラッシュの修正 (Babel設定ファイル不足)

## 目標の説明
Androidアプリが起動時にクラッシュ（白い画面）する問題の調査において、`apps/mobile/babel.config.js` が存在しないことが判明しました。
`expo-router` を使用する場合、ルーティング機能を正しく動作させるために `babel.config.js` で `expo-router/babel` プラグインを設定することが**必須**です。このファイルがないと、アプリは初期ルートを解決できず、起動に失敗する可能性が高いです。

この問題を解決するために、適切な `babel.config.js` を作成します。

## ユーザーレビュー必須事項
> [!IMPORTANT]
> 必須の設定ファイル `babel.config.js` を新規作成します。これにより、ビルドプロセスが変更され、ルーティングが正しく機能するようになります。

## 提案される変更

### モバイルアプリ (`apps/mobile`)

#### [新規作成] [babel.config.js](file:///bme-storage/Project/MCD3/TUMON/mc-gate/apps/mobile/babel.config.js)
- `babel-preset-expo` と `expo-router/babel` プラグインを含む設定ファイルを作成します。

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-routerに必須
      'expo-router/babel',
    ],
  };
};
```

## 検証計画

### 手動検証
- 以下の手順で検証をお願いします：
    1.  変更を適用する。
    2.  **バンドラーのキャッシュをクリアする**: `npx expo start -c`
        *   ※重要: Babel設定の変更を反映させるためにキャッシュクリアが必要です。
    3.  アプリを再ビルド/再起動する。
    4.  アプリが正常に起動することを確認する。
