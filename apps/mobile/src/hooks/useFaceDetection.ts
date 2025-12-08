// ==========================================
// 顔検出フック（本番実装 - リアルタイム顔検出）
// ==========================================
//
// react-native-vision-camera + vision-camera-face-detector を使用した
// リアルタイム顔検出の実装
//
// 重要な実装ポイント:
// 1. 'worklet'; を必ず先頭に書く
// 2. runOnJS() でしか JS state に戻らない
// 3. try/catch で WorkletsError を握る
//
// ==========================================

import { useState, useMemo, useCallback } from "react";
import {
  useFrameProcessor,
  type Frame,
} from "react-native-vision-camera";
import { runOnJS } from "react-native-reanimated";
import { scanFaces } from "vision-camera-face-detector";

export type DetectedFace = {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
};

type UseFaceDetectionOptions = {
  /** 顔の最低面積（ピクセル） */
  minArea?: number;
};

/**
 * リアルタイム顔検出フック
 *
 * @param options - 検出オプション
 * @returns frameProcessor, faces, bestFace, hasFace, isFaceQualityEnough
 */
export const useFaceDetection = (options: UseFaceDetectionOptions = {}) => {
  const { minArea = 20000 } = options;

  const [faces, setFaces] = useState<DetectedFace[]>([]);

  const updateFaces = useCallback((rawFaces: any[]) => {
    const mapped: DetectedFace[] = rawFaces.map((f) => {
      const bounds = f.bounds ?? f.boundingBox ?? {};
      const width = bounds.width ?? 0;
      const height = bounds.height ?? 0;
      return {
        x: bounds.x ?? 0,
        y: bounds.y ?? 0,
        width,
        height,
        area: width * height,
      };
    });

    setFaces(mapped);
  }, []);

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      "worklet";
      try {
        // MLKit / FaceDetector プラグインで検出
        const rawFaces = scanFaces(frame) as any[];

        // JS側に渡す（Worklet内では setState 禁止）
        runOnJS(updateFaces)(rawFaces);
      } catch (e) {
        // WorkletsError対策：ここで握りつぶす（クラッシュ防止）
        // Worklet内では console.log も使えないので何もしない
      }
    },
    [updateFaces]
  );

  const hasFace = faces.length > 0;

  const bestFace = useMemo(() => {
    if (faces.length === 0) return null;
    return faces.reduce((max, f) => (f.area > max.area ? f : max), faces[0]);
  }, [faces]);

  const isFaceQualityEnough = useMemo(() => {
    if (!bestFace) return false;
    return bestFace.area >= minArea;
  }, [bestFace, minArea]);

  return {
    frameProcessor,
    faces,
    bestFace,
    hasFace,
    isFaceQualityEnough,
  };
};
