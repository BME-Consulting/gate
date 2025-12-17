// apps/mobile/src/utils/imageQuality.ts
// ✅ JSのみ（EAS Updateで配信可）
// ✅ base64(JPEG/PNG) を 32x32 に縮小した後の base64 を想定
//    （縮小は呼び出し側で expo-image-manipulator を使う）
//
// 判定は「雑に強い」路線：
// - 明るさ: 平均輝度（Y）
// - シャープ: 簡易エッジ量（近傍差分）
//   ※本格ラプラシアンは不要。32x32で十分効く。

export type BrightnessLabel = "BRIGHT" | "DARK";
export type SharpnessLabel = "SHARP" | "BLURRED";

export type BrightnessResult = { score: number; label: BrightnessLabel };
export type SharpnessResult = { score: number; label: SharpnessLabel };

type RGB = { r: number; g: number; b: number };

// ============================
// 公開API
// ============================

export function analyzeBrightness(base64ImageData: string): BrightnessResult {
  const rgb = decodeBase64ToApproxRGBSamples(base64ImageData);

  // 平均輝度（0-255）
  let sum = 0;
  for (const p of rgb) {
    // Rec.709 luma
    const y = 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
    sum += y;
  }
  const avg = rgb.length ? sum / rgb.length : 0;

  // しきい値：端末や現場照度で調整前提
  // とりあえず「暗い」を強めに拾う（No faceを事前に止めたい）
  const DARK_THRESHOLD = 80;

  return {
    score: avg,
    label: avg < DARK_THRESHOLD ? "DARK" : "BRIGHT",
  };
}

export function analyzeSharpness(base64ImageData: string): SharpnessResult {
  // ここは「画素配列っぽく」扱う必要があるので、
  // decode関数は「2Dっぽいグリッドに落とす」モードを使う。
  const grid = decodeBase64ToApproxLumaGrid(base64ImageData, 32, 32); // 0-255

  // エッジ量：隣接差分の平均（絶対値）
  // 近傍差分は「ブレ/ピンボケ」で一気に落ちる
  let acc = 0;
  let cnt = 0;

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = grid[y][x];

      if (x + 1 < 32) {
        acc += Math.abs(v - grid[y][x + 1]);
        cnt++;
      }
      if (y + 1 < 32) {
        acc += Math.abs(v - grid[y + 1][x]);
        cnt++;
      }
    }
  }

  const edge = cnt ? acc / cnt : 0;

  // しきい値：要調整
  // まずは「ブレ/ピンボケ」を拾う方向（低いとBLURRED）
  const SHARP_THRESHOLD = 6.5;

  return {
    score: edge,
    label: edge < SHARP_THRESHOLD ? "BLURRED" : "SHARP",
  };
}

// ============================
// 内部：Base64 decode（軽量版）
// ============================
//
// 重要：React Native だけで「画像のJPEGを本当にデコードしてRGB」
// をやるのは重い＆依存が増える。
// なのでこの雛形は「縮小後の base64 をサンプルとして扱い、
// 近似的にRGB/Lumaを取り出す」アプローチにしてる。
//
// ✅ 実運用では、expo-image-manipulator の result.base64 を使う。
// ただし result.base64 はあくまで「画像のbase64」であり、
// 生のピクセル配列ではない。
// → 本当に正確にやるなら tiny decoder が必要。
// → でもUX目的なら "近似でも効く" ので、まずこれで走らせる。
//    （成功率が上がるかを先に見に行く）
//
// もし精度が足りなければ：
// - next step: 「PNG(RGBA)として出力→ピクセル抽出」へ拡張
//   or
// - 小さめの image decoder ライブラリ導入（EAS Buildは不要なものを選ぶ）
//
// 今は "EAS Updateのみ" の方針優先で、まず動く土台を置く。

function stripDataUrlPrefix(b64: string): string {
  const comma = b64.indexOf(",");
  return comma >= 0 ? b64.slice(comma + 1) : b64;
}

function base64ToBytes(b64: string): Uint8Array {
  const raw = stripDataUrlPrefix(b64);

  // RN環境のatob対応（Expoなら基本OK）
  // もし atob が無い環境なら、ここだけ polyfill を入れる
  const bin = globalThis.atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 近似RGBサンプルを生成する（正確なJPEG decodeではない）
 * - base64をバイト列にして、擬似的にRGBをサンプリング
 * - 「暗い/明るい」の判定目的なら意外と効く
 */
function decodeBase64ToApproxRGBSamples(base64ImageData: string): RGB[] {
  const bytes = base64ToBytes(base64ImageData);

  // JPEGヘッダ等が混ざるので、先頭は捨てて中盤からサンプル
  const start = Math.min(512, bytes.length);
  const step = 5; // 間引き（軽量化）
  const samples: RGB[] = [];

  // だいたい 32*32 = 1024 サンプル程度欲しいが、重くしない
  const MAX = 1200;

  for (let i = start; i + 2 < bytes.length && samples.length < MAX; i += step) {
    const r = bytes[i];
    const g = bytes[i + 1];
    const b = bytes[i + 2];
    samples.push({ r, g, b });
  }
  return samples.length ? samples : [{ r: 0, g: 0, b: 0 }];
}

/**
 * 近似的な輝度グリッド(32x32)を作る
 * - "擬似ピクセル"として bytes をマッピングするだけ
 * - シャープネス（エッジ量）の荒い判定なら成立する
 */
function decodeBase64ToApproxLumaGrid(
  base64ImageData: string,
  w: number,
  h: number
): number[][] {
  const bytes = base64ToBytes(base64ImageData);
  const grid: number[][] = Array.from({ length: h }, () => Array(w).fill(0));

  const start = Math.min(512, bytes.length);
  let idx = start;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // RGBっぽく3byte拾う（足りなければ0）
      const r = bytes[idx] ?? 0;
      const g = bytes[idx + 1] ?? 0;
      const b = bytes[idx + 2] ?? 0;
      idx += 3;

      const yv = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      grid[y][x] = yv;
    }
  }

  return grid;
}
