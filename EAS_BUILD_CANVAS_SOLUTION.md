# EAS Build canvas エラーの解決策

## 問題の概要

EAS Build で `canvas@2.11.2` のインストールが失敗し、以下のエラーが発生していました:

```
Package pixman-1 was not found in the pkg-config search path.
Perhaps you should add the directory containing `pixman-1.pc'
to the PKG_CONFIG_PATH environment variable
Package 'pixman-1', required by 'virtual:world', not found
gyp: Call to 'pkg-config pixman-1 --libs' returned exit status 1
```

## 根本原因

1. **pnpm workspace の依存関係解決**
   - `apps/face-api` が `canvas@2.11.2` を dependencies として使用
   - pnpm はモノレポ全体の依存関係を解決するため、ルートの node_modules に canvas がインストールされる
   - モバイルアプリは face-api を直接依存していないが、EAS Build 環境で canvas のビルドが試行される

2. **canvas のネイティブビルド要件**
   - canvas@2.11.2 は Node.js のネイティブアドオン（C++）
   - Linux ビルド環境で pixman-1 ライブラリが必要
   - Node.js 22.12.0 では canvas のプリビルドバイナリが提供されていない可能性

3. **モバイルアプリには不要**
   - canvas は face-api サーバーでのみ使用
   - モバイルアプリ（React Native）は canvas を使用しない

## 解決策

### オプション C: canvas をオプショナル依存関係にする（推奨）

**実装済み**

#### 変更内容

1. **apps/face-api/package.json**
   ```json
   {
     "dependencies": {
       "@tensorflow/tfjs-node": "^4.22.0",
       "@vladmandic/face-api": "^1.7.12",
       "better-sqlite3": "^9.2.2",
       "cors": "^2.8.5",
       "express": "^4.18.2"
     },
     "optionalDependencies": {
       "canvas": "^2.11.2"
     }
   }
   ```

   - canvas を `dependencies` から `optionalDependencies` に移動

2. **.npmrc（新規作成）**
   ```
   # pnpm configuration
   shamefully-hoist=true
   strict-peer-dependencies=false

   # Ignore optional dependencies build failures
   optional=true
   ```

#### メリット

- canvas のビルドが失敗しても pnpm install が成功する
- face-api サーバーでは引き続き canvas を使用可能（ビルド環境が整っている場合）
- モバイルアプリの EAS Build に影響を与えない
- pnpm workspace の構造を変更しない

#### デメリット

- face-api サーバーの開発環境で canvas のビルドに失敗する可能性
  - 対策: ローカル環境では pixman-1 をインストール（後述）

## face-api サーバーでの canvas インストール

### Linux（Ubuntu/Debian）

```bash
# pixman と cairo の依存関係をインストール
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  pkg-config \
  python3

# pnpm install
pnpm install
```

### macOS

```bash
# Homebrew で依存関係をインストール
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman

# pnpm install
pnpm install
```

### Docker（face-api サーバー用）

```dockerfile
FROM node:22-slim

# canvas の依存関係をインストール
RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  pkg-config \
  python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN corepack enable pnpm && pnpm install
```

## 動作確認

### モバイルアプリの EAS Build

```bash
# EAS Build を実行
cd apps/mobile
npx eas-cli build --platform android --profile preview --non-interactive
```

**期待される結果**: canvas のビルドエラーが発生せず、ビルドが成功する

### face-api サーバーの動作確認

```bash
# face-api サーバーを起動
cd apps/face-api
pnpm install  # canvas がオプショナルでもインストールされる（環境が整っている場合）
pnpm dev
```

**期待される結果**: canvas が正常にインストールされ、顔認識機能が動作する

## 代替案（参考）

### オプション A: face-api を devDependencies に移動

**理由で不採用**:
- face-api は本番環境で必要なサービス
- devDependencies に移動すると本番デプロイで問題が発生

### オプション B: pnpm の --filter オプションを使う

**理由で不採用**:
- EAS Build の内部動作を変更する必要がある
- pnpm workspace の依存関係解決を回避できない

### オプション D: Node.js バージョンを戻す

**理由で不採用**:
- Node.js 22.12.0 は最新の機能とセキュリティ修正を含む
- canvas のプリビルドバイナリの問題は Node 20 でも発生する可能性

## トラブルシューティング

### canvas のビルドが失敗する場合

1. **システム依存関係の確認**
   ```bash
   pkg-config --modversion pixman-1
   pkg-config --modversion cairo
   ```

2. **Node.js バージョンの確認**
   ```bash
   node --version  # 22.12.0 推奨
   ```

3. **ビルドログの確認**
   ```bash
   pnpm install --loglevel debug
   ```

### EAS Build が失敗する場合

1. **.npmrc の確認**
   - `optional=true` が設定されているか確認

2. **package.json の確認**
   - canvas が `optionalDependencies` に存在するか確認

3. **pnpm-lock.yaml の再生成**
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   ```

## まとめ

- canvas を `optionalDependencies` に移動することで、EAS Build のエラーを回避
- face-api サーバーでは引き続き canvas を使用可能
- pnpm workspace の構造を変更せず、最小限の変更で解決
- モバイルアプリの開発・ビルドに影響を与えない

---

**最終更新**: 2025-11-14
**作成者**: Claude Code Agent
**関連ファイル**:
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/face-api/package.json`
- `/volume2/Project/MCD3/TUMON/mc-gate/.npmrc`
