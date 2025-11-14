/**
 * ローカル顔認証マッチャー
 *
 * Face APIに依存せず、ローカルのface_embeddingを使用して
 * ユークリッド距離ベースの顔マッチングを実行します。
 */

export interface FaceMatchResult {
  personId: string;
  distance: number;
  confidence: number; // 1 - (distance / maxDistance)
}

/**
 * ユークリッド距離を計算
 *
 * Face APIの実装と同じアルゴリズムを使用
 * L2 Distance = √(Σ(e1[i] - e2[i])²)
 *
 * @param embedding1 128次元の顔埋め込みベクトル
 * @param embedding2 128次元の顔埋め込みベクトル
 * @returns ユークリッド距離 (0に近いほど類似)
 */
export function calculateEuclideanDistance(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error(
      `Embedding dimensions must match: ${embedding1.length} !== ${embedding2.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < embedding1.length; i++) {
    const diff = embedding1[i] - embedding2[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * 距離から信頼度スコアを計算
 *
 * @param distance ユークリッド距離
 * @param maxDistance 最大距離 (デフォルト: 2.0)
 * @returns 信頼度スコア (0.0 - 1.0)
 */
export function distanceToConfidence(
  distance: number,
  maxDistance: number = 2.0
): number {
  const confidence = 1.0 - Math.min(distance / maxDistance, 1.0);
  return Math.max(0, confidence); // 負の値を防ぐ
}

/**
 * 顔認証の閾値判定
 *
 * @param distance ユークリッド距離
 * @param threshold 閾値 (デフォルト: 0.6)
 * @returns true: マッチ, false: マッチなし
 */
export function isSamePerson(
  distance: number,
  threshold: number = 0.6
): boolean {
  return distance < threshold;
}

/**
 * ローカル顔認証マッチャー
 *
 * 登録済みのface_embeddingと入力embeddingを比較し、
 * 最も類似した人物を特定します。
 */
export class LocalFaceMatcher {
  private registeredEmbeddings: Map<string, number[]> = new Map();
  private threshold: number;

  /**
   * @param threshold マッチング閾値 (デフォルト: 0.6)
   */
  constructor(threshold: number = 0.6) {
    this.threshold = threshold;
  }

  /**
   * 登録済みembeddingを追加
   *
   * @param personId 人物ID
   * @param embedding 128次元の顔埋め込みベクトル
   */
  addEmbedding(personId: string, embedding: number[]): void {
    if (embedding.length !== 128) {
      console.warn(
        `[LocalFaceMatcher] Unexpected embedding dimension: ${embedding.length} (expected 128)`
      );
    }
    this.registeredEmbeddings.set(personId, embedding);
  }

  /**
   * 複数の登録済みembeddingを一括追加
   *
   * @param embeddings personId -> embedding のマップ
   */
  addEmbeddings(embeddings: Map<string, number[]>): void {
    embeddings.forEach((embedding, personId) => {
      this.addEmbedding(personId, embedding);
    });
  }

  /**
   * 登録データをクリア
   */
  clear(): void {
    this.registeredEmbeddings.clear();
  }

  /**
   * 登録件数を取得
   */
  getCount(): number {
    return this.registeredEmbeddings.size;
  }

  /**
   * 顔認証を実行
   *
   * @param inputEmbedding 入力画像から抽出した128次元embedding
   * @returns マッチ結果 (マッチなしの場合はnull)
   */
  recognize(inputEmbedding: number[]): FaceMatchResult | null {
    if (this.registeredEmbeddings.size === 0) {
      console.warn("[LocalFaceMatcher] No registered embeddings");
      return null;
    }

    if (inputEmbedding.length !== 128) {
      console.error(
        `[LocalFaceMatcher] Invalid input embedding dimension: ${inputEmbedding.length}`
      );
      return null;
    }

    // すべての登録済みembeddingと距離を計算
    const results: FaceMatchResult[] = [];

    this.registeredEmbeddings.forEach((embedding, personId) => {
      try {
        const distance = calculateEuclideanDistance(inputEmbedding, embedding);
        const confidence = distanceToConfidence(distance);

        results.push({
          personId,
          distance,
          confidence,
        });
      } catch (error) {
        console.error(
          `[LocalFaceMatcher] Error calculating distance for ${personId}:`,
          error
        );
      }
    });

    if (results.length === 0) {
      return null;
    }

    // 距離が最小のものを取得
    const bestMatch = results.reduce((min, curr) =>
      curr.distance < min.distance ? curr : min
    );

    // 閾値判定
    if (isSamePerson(bestMatch.distance, this.threshold)) {
      return bestMatch;
    }

    return null;
  }

  /**
   * 顔認証を実行し、上位N件を返す
   *
   * @param inputEmbedding 入力画像から抽出した128次元embedding
   * @param topN 返す結果の数 (デフォルト: 5)
   * @returns マッチ結果の配列 (距離の昇順)
   */
  recognizeTopN(inputEmbedding: number[], topN: number = 5): FaceMatchResult[] {
    if (this.registeredEmbeddings.size === 0) {
      return [];
    }

    if (inputEmbedding.length !== 128) {
      console.error(
        `[LocalFaceMatcher] Invalid input embedding dimension: ${inputEmbedding.length}`
      );
      return [];
    }

    // すべての登録済みembeddingと距離を計算
    const results: FaceMatchResult[] = [];

    this.registeredEmbeddings.forEach((embedding, personId) => {
      try {
        const distance = calculateEuclideanDistance(inputEmbedding, embedding);
        const confidence = distanceToConfidence(distance);

        results.push({
          personId,
          distance,
          confidence,
        });
      } catch (error) {
        console.error(
          `[LocalFaceMatcher] Error calculating distance for ${personId}:`,
          error
        );
      }
    });

    // 距離の昇順でソート
    results.sort((a, b) => a.distance - b.distance);

    // 上位N件を返す
    return results.slice(0, topN);
  }

  /**
   * 閾値を変更
   *
   * @param threshold 新しい閾値
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * 現在の閾値を取得
   */
  getThreshold(): number {
    return this.threshold;
  }
}
