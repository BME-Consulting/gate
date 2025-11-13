import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData } from 'canvas';
import * as path from 'path';

// canvas polyfill for face-api.js
// @ts-ignore
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

/**
 * face-api.jsモデルをロード
 */
export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;

  const modelPath = path.join(__dirname, '../../models');

  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
    faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
    faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
  ]);

  modelsLoaded = true;
  console.log('✅ face-api.js models loaded');
}

/**
 * Base64画像から顔エンコーディングを抽出
 */
export async function extractFaceEmbedding(base64Image: string): Promise<number[] | null> {
  // モデルロード確認
  if (!modelsLoaded) {
    await loadModels();
  }

  // Base64デコード
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Canvas画像作成
  const img = new Image();
  img.src = buffer;

  // 顔検出
  const detection = await faceapi
    .detectSingleFace(img as any)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return null; // 顔が検出されなかった
  }

  // 顔エンコーディング（128次元→512次元に拡張する場合は別途処理）
  // face-api.jsのdescriptorは128次元
  const descriptor = Array.from(detection.descriptor);

  return descriptor;
}

/**
 * 2つの顔エンコーディングの距離を計算（ユークリッド距離）
 */
export function calculateDistance(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < embedding1.length; i++) {
    const diff = embedding1[i] - embedding2[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * 顔の類似度判定（閾値: 0.6）
 */
export function isSamePerson(distance: number, threshold: number = 0.6): boolean {
  return distance < threshold;
}
