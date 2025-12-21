// ==========================================
// 設定画面
// ==========================================

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Platform, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Button, tokens } from "@mc-gate/ui-kit";
import { MockCardReader } from "@mc-gate/reader-bridge";
import { useAppStore } from "../../store/appStore";
import { useWorkers } from "../../hooks/useWorkers";
import type { CheckConfig } from "@mc-gate/core";
import { TIMEOUT, fetchWithTimeout } from "@mc-gate/core";
import { ApiError } from "@mc-gate/api-client";
import { PasscodeModal } from "../../components/PasscodeModal";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Updates from "expo-updates";
import Constants from "expo-constants";


// BLEリーダーのシングルトンインスタンス
let readerInstance: MockCardReader | null = null;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, currentProject, availableProjects, logout, setCurrentProject, passcode, isPasscodeEnabled, setPasscode } = useAppStore();

  // [DEBUG] useWorkers の返却内容を確認
  const workersHook = useWorkers();
  console.log("[WORKERS] hook keys =", workersHook ? Object.keys(workersHook) : null);
  console.log("[WORKERS] syncFromServer typeof =", typeof (workersHook as any)?.syncFromServer);

  const { isReady: workersReady, workers, getAllWorkers, syncFromServer } = workersHook;

  // 作業員マスタ同期状態
  const [workerCount, setWorkerCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // チェック設定（プロジェクト設定から初期化）
  const [checkConfig, setCheckConfig] = useState<CheckConfig>({
    ccusIdCheck: currentProject?.checkConfig.ccusIdCheck ?? true,
    socialInsuranceCheck: currentProject?.checkConfig.socialInsuranceCheck ?? true,
    residencyCheck: currentProject?.checkConfig.residencyCheck ?? true,
    ageCheck: currentProject?.checkConfig.ageCheck ?? true,
    healthCheck: currentProject?.checkConfig.healthCheck ?? true,
    soleProprietorCheck: currentProject?.checkConfig.soleProprietorCheck ?? true,
  });

  // その他の設定
  const [autoSync, setAutoSync] = useState(true);
  const [showPersonId, setShowPersonId] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState<"none" | "hourly" | "time">("none");
  const [syncTime, setSyncTime] = useState(new Date(new Date().setHours(9, 0, 0, 0))); // デフォルト9:00
  const [showTimePicker, setShowTimePicker] = useState(false);

  // BLE状態
  const [bleConnected, setBleConnected] = useState(false);
  const [bleDeviceInfo, setBleDeviceInfo] = useState<string>("");
  const [bleConnecting, setBleConnecting] = useState(false);

  // パスコードモーダル
  const [passcodeModalVisible, setPasscodeModalVisible] = useState(false);
  const [passcodeModalMode, setPasscodeModalMode] = useState<"set" | "verify">("set");
  const [tempPasscode, setTempPasscode] = useState("");

  // プロジェクト選択モーダル
  const [projectModalVisible, setProjectModalVisible] = useState(false);

  // EAS Update情報
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    updateId: string | undefined;
    createdAt: Date | undefined;
    isEmbeddedLaunch: boolean;
    channel: string | null;
  }>({
    currentVersion: Constants.expoConfig?.version || "不明",
    updateId: undefined,
    createdAt: undefined,
    isEmbeddedLaunch: true,
    channel: null,
  });
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    // リーダーインスタンスの初期化
    if (!readerInstance) {
      readerInstance = new MockCardReader();
    }

    // 接続状態の確認
    checkBleConnection();

    // Update情報を取得
    loadUpdateInfo();

    // 作業員数を取得
    loadWorkerCount();
  }, []);

  const loadWorkerCount = async () => {
    if (Platform.OS === "web" || !workersReady) {
      return;
    }

    try {
      const allWorkers = await getAllWorkers();
      setWorkerCount(allWorkers.length);
    } catch (error) {
      console.error("Failed to load worker count:", error);
    }
  };

  const loadUpdateInfo = async () => {
    try {
      console.log("==================== UPDATE INFO DEBUG ====================");
      console.log("[DEBUG] Updates.isEnabled:", Updates.isEnabled);
      console.log("[DEBUG] Updates.channel:", Updates.channel);
      console.log("[DEBUG] Updates.updateId:", Updates.updateId);
      console.log("[DEBUG] Updates.isEmbeddedLaunch:", Updates.isEmbeddedLaunch);
      console.log("[DEBUG] Updates.runtimeVersion:", Updates.runtimeVersion);
      console.log("[DEBUG] Constants.expoConfig?.extra:", JSON.stringify(Constants.expoConfig?.extra, null, 2));
      console.log("===========================================================");

      if (!Updates.isEnabled) {
        console.log("[DEBUG] Updates disabled (development mode)");
        return; // 開発モードではUpdates無効
      }

      console.log("[DEBUG] Checking for updates...");
      const update = await Updates.checkForUpdateAsync();
      console.log("[DEBUG] Update check result:", {
        isAvailable: update.isAvailable,
        manifest: update.manifest ? "present" : "null",
      });

      setUpdateInfo({
        currentVersion: Constants.expoConfig?.version || "不明",
        updateId: Updates.updateId || undefined,
        createdAt: Updates.createdAt || undefined,
        isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        channel: Updates.channel,
      });

      if (update.isAvailable) {
        Alert.alert(
          "アップデート利用可能",
          "新しいバージョンが利用可能です。今すぐダウンロードしますか？",
          [
            { text: "後で", style: "cancel" },
            {
              text: "ダウンロード",
              onPress: async () => {
                await fetchAndApplyUpdate();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error("==================== UPDATE CHECK ERROR ====================");
      console.error("[ERROR] Error type:", error?.constructor?.name);
      console.error("[ERROR] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[ERROR] Error stack:", error instanceof Error ? error.stack : "no stack");
      console.error("===========================================================");
    }
  };

  const checkForUpdates = async () => {
    if (!Updates.isEnabled) {
      Alert.alert("開発モード", "開発モードではEAS Updateは利用できません");
      return;
    }

    setIsCheckingUpdates(true);

    try {
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        Alert.alert(
          "アップデート利用可能",
          "新しいバージョンが利用可能です。今すぐダウンロードしますか？",
          [
            { text: "キャンセル", style: "cancel" },
            {
              text: "ダウンロード",
              onPress: async () => {
                await fetchAndApplyUpdate();
              },
            },
          ]
        );
      } else {
        Alert.alert("最新版", "アプリは最新版です");
      }
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "アップデート確認に失敗しました"
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const fetchAndApplyUpdate = async () => {
    try {
      const result = await Updates.fetchUpdateAsync();

      if (result.isNew) {
        Alert.alert(
          "ダウンロード完了",
          "アップデートをダウンロードしました。アプリを再起動して適用しますか？",
          [
            { text: "後で", style: "cancel" },
            {
              text: "再起動",
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "アップデートのダウンロードに失敗しました"
      );
    }
  };

  const checkBleConnection = async () => {
    if (!readerInstance) return;

    try {
      const connected = await readerInstance.isConnected();
      setBleConnected(connected);

      if (connected) {
        const info = await readerInstance.deviceInfo();
        setBleDeviceInfo(`${info.name} (FW: ${info.firmwareVersion})`);
      }
    } catch (error) {
      console.error("BLE connection check failed:", error);
    }
  };

  const handleBleConnect = async () => {
    if (!readerInstance) return;

    setBleConnecting(true);

    try {
      await readerInstance.connect();
      const info = await readerInstance.deviceInfo();
      setBleDeviceInfo(`${info.name} (FW: ${info.firmwareVersion})`);
      setBleConnected(true);

      Alert.alert("接続成功", `${info.name} に接続しました。`);
    } catch (error) {
      Alert.alert(
        "接続失敗",
        error instanceof Error ? error.message : "BLEリーダーとの接続に失敗しました"
      );
    } finally {
      setBleConnecting(false);
    }
  };

  const handleBleDisconnect = async () => {
    if (!readerInstance) return;

    try {
      await readerInstance.disconnect();
      setBleConnected(false);
      setBleDeviceInfo("");

      Alert.alert("切断完了", "BLEリーダーから切断しました。");
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "切断に失敗しました"
      );
    }
  };

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  const handleCheckConfigChange = (key: keyof CheckConfig, value: boolean) => {
    const newConfig = { ...checkConfig, [key]: value };
    setCheckConfig(newConfig);

    // プロジェクト設定も更新
    if (currentProject) {
      setCurrentProject({
        ...currentProject,
        checkConfig: newConfig,
      });
    }
  };

  const isServerLocked = currentProject?.serverLock ?? false;

  const handlePasscodeToggle = (enabled: boolean) => {
    if (enabled) {
      // パスコードを設定
      setPasscodeModalMode("set");
      setPasscodeModalVisible(true);
    } else {
      // パスコードを無効化（確認のため現在のパスコードを入力）
      setPasscodeModalMode("verify");
      setPasscodeModalVisible(true);
    }
  };

  const handlePasscodeSuccess = (newPasscode?: string) => {
    if (passcodeModalMode === "set" && newPasscode) {
      // パスコード設定成功
      setPasscode(newPasscode);
      Alert.alert("設定完了", "パスコードロックを有効にしました");
    } else {
      // パスコード確認成功 → 無効化
      setPasscode(null);
      Alert.alert("解除完了", "パスコードロックを無効にしました");
    }
    setPasscodeModalVisible(false);
  };

  const handlePasscodeCancel = () => {
    setPasscodeModalVisible(false);
    setTempPasscode("");
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (selectedDate) {
      setSyncTime(selectedDate);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };

  const handleWorkerSync = async () => {
    if (Platform.OS === "web") {
      Alert.alert("エラー", "Web環境では作業員同期機能は利用できません");
      return;
    }

    if (!workersReady) {
      Alert.alert("エラー", "作業員データベースの初期化中です。しばらくお待ちください。");
      return;
    }

    if (!user?.token) {
      Alert.alert("エラー", "認証情報が見つかりません。再度ログインしてください。");
      return;
    }

    setIsSyncing(true);

    try {
      // Workers APIはGS API を使用
      const apiBaseGs = Constants.expoConfig?.extra?.apiBaseGs;
      const apiGsApiKey = Constants.expoConfig?.extra?.apiGsApiKey;

      if (!apiBaseGs || !apiGsApiKey) {
        throw new Error("GS API設定が見つかりません。アプリの再ビルドが必要です。");
      }

      const workersApiUrl = `${apiBaseGs}/api/workers`;

      // デバッグログ: 接続先URL
      console.log("==================== WORKER SYNC DEBUG ====================");
      console.log(`[DEBUG] GS API URL: ${apiBaseGs}`);
      console.log(`[DEBUG] Workers API URL: ${workersApiUrl}`);
      console.log(`[DEBUG] API Key: ${apiGsApiKey.substring(0, 20)}...`);
      console.log("===========================================================");

      console.log("[DEBUG] Starting worker sync...");
      console.log("[DEBUG] syncFromServer type:", typeof syncFromServer);
      console.log("[DEBUG] syncFromServer is function:", typeof syncFromServer === 'function');

      if (typeof syncFromServer !== 'function') {
        console.error("[WORKERS] syncFromServer missing in workersHook:", workersHook);
        throw new Error(`syncFromServer is not a function, it is: ${typeof syncFromServer}. Available keys: ${workersHook ? Object.keys(workersHook).join(', ') : 'null'}`);
      }

      await syncFromServer(workersApiUrl, apiGsApiKey, user.token);
      console.log("[DEBUG] Worker sync completed successfully");

      // 同期後に作業員数を再取得
      await loadWorkerCount();

      Alert.alert("同期完了", "作業員マスタの同期が完了しました。");
    } catch (error: any) {
      console.error("==================== WORKER SYNC ERROR ====================");
      console.error("[ERROR] Error type:", error?.constructor?.name);
      console.error("[ERROR] Error name:", error?.name);
      console.error("[ERROR] Error message:", error?.message);
      console.error("[ERROR] Error stack:", error?.stack);
      console.error("===========================================================");

      // ApiError の場合は toUserMessage() を使用（運用に優しい分類済みメッセージ）
      if (error instanceof ApiError) {
        Alert.alert("同期失敗", error.toUserMessage());
      } else {
        // その他のエラー（予期しない）
        const fallbackMessage = error instanceof Error
          ? `予期しないエラーが発生しました\n\n${error.message}\n\n管理者に問い合わせてください。`
          : "サーバーとの同期に失敗しました。";
        Alert.alert("同期失敗", fallbackMessage);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleProjectSelect = async (project: ProjectConfig) => {
    await setCurrentProject(project);
    setProjectModalVisible(false);
    Alert.alert("プロジェクト切り替え", `${project.name} に切り替えました`);
  };

  return (
    <>
      <PasscodeModal
        visible={passcodeModalVisible}
        mode={passcodeModalMode}
        onSuccess={handlePasscodeSuccess}
        onCancel={handlePasscodeCancel}
        currentPasscode={passcode || undefined}
      />

      {/* プロジェクト選択モーダル */}
      <Modal
        visible={projectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProjectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>プロジェクト選択</Text>
            <Text style={styles.modalSubtitle}>切り替えるプロジェクトを選択してください</Text>

            <View style={styles.projectList}>
              {availableProjects.map((project) => {
                const isSelected = currentProject?.projectId === project.projectId;

                return (
                  <TouchableOpacity
                    key={project.projectId}
                    style={[styles.projectItem, isSelected && styles.projectItemSelected]}
                    onPress={() => handleProjectSelect(project)}
                  >
                    <View style={styles.projectInfo}>
                      <Text style={[styles.projectId, isSelected && styles.projectIdSelected]}>
                        {project.projectId}
                      </Text>
                      <Text style={[styles.projectName, isSelected && styles.projectNameSelected]}>
                        {project.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>選択中</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <Button
                title="キャンセル"
                variant="secondary"
                onPress={() => setProjectModalVisible(false)}
                fullWidth
              />
            </View>
          </View>
        </View>
      </Modal>

    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* ユーザー情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ユーザー情報</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>ユーザー名</Text>
              <Text style={styles.value}>{user?.name}</Text>
            </View>
          </View>
        </View>

        {/* プロジェクト管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>プロジェクト管理</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>現在のプロジェクト</Text>
              <Text style={styles.value}>
                {currentProject ? `${currentProject.projectId} - ${currentProject.name}` : "未選択"}
              </Text>
            </View>

            {availableProjects.length > 0 && (
              <View style={styles.buttonRow}>
                <Button
                  title="プロジェクト切り替え"
                  variant="secondary"
                  onPress={() => setProjectModalVisible(true)}
                  fullWidth
                />
              </View>
            )}

            {availableProjects.length === 0 && (
              <Text style={styles.note}>
                利用可能なプロジェクトがありません
              </Text>
            )}
          </View>
        </View>

        {/* チェック設定 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>チェック設定</Text>
          <View style={styles.card}>
            <View style={[styles.row, isServerLocked && styles.disabled]}>
              <Text style={styles.label}>CCUS技能者IDチェック</Text>
              <Switch
                value={checkConfig.ccusIdCheck}
                onValueChange={(val) => handleCheckConfigChange("ccusIdCheck", val)}
                disabled={isServerLocked}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            <View style={[styles.row, isServerLocked && styles.disabled]}>
              <Text style={styles.label}>社会保険チェック</Text>
              <Switch
                value={checkConfig.socialInsuranceCheck}
                onValueChange={(val) => handleCheckConfigChange("socialInsuranceCheck", val)}
                disabled={isServerLocked}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            <View style={[styles.row, isServerLocked && styles.disabled]}>
              <Text style={styles.label}>在留期限チェック</Text>
              <Switch
                value={checkConfig.residencyCheck}
                onValueChange={(val) => handleCheckConfigChange("residencyCheck", val)}
                disabled={isServerLocked}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            <View style={[styles.row, isServerLocked && styles.disabled]}>
              <Text style={styles.label}>年齢チェック</Text>
              <Switch
                value={checkConfig.ageCheck}
                onValueChange={(val) => handleCheckConfigChange("ageCheck", val)}
                disabled={isServerLocked}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            <View style={[styles.row, isServerLocked && styles.disabled]}>
              <Text style={styles.label}>健康チェック</Text>
              <Switch
                value={checkConfig.healthCheck}
                onValueChange={(val) => handleCheckConfigChange("healthCheck", val)}
                disabled={isServerLocked}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            <View style={[styles.row, isServerLocked && styles.disabled]}>
              <Text style={styles.label}>一人親方チェック</Text>
              <Switch
                value={checkConfig.soleProprietorCheck}
                onValueChange={(val) => handleCheckConfigChange("soleProprietorCheck", val)}
                disabled={isServerLocked}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            {isServerLocked && (
              <Text style={styles.note}>
                ※サーバロック設定により変更できません
              </Text>
            )}
          </View>
        </View>

        {/* 表示設定 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>表示設定</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>技能者ID表示</Text>
              <Switch
                value={showPersonId}
                onValueChange={setShowPersonId}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
          </View>
        </View>

        {/* 同期設定 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>同期設定</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>自動同期</Text>
              <Switch
                value={autoSync}
                onValueChange={setAutoSync}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>

            {autoSync && (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>同期頻度</Text>
                </View>

                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setSyncFrequency("none")}
                  >
                    <View style={[styles.radio, syncFrequency === "none" && styles.radioSelected]}>
                      {syncFrequency === "none" && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>手動のみ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setSyncFrequency("hourly")}
                  >
                    <View style={[styles.radio, syncFrequency === "hourly" && styles.radioSelected]}>
                      {syncFrequency === "hourly" && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>1時間ごと</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setSyncFrequency("time")}
                  >
                    <View style={[styles.radio, syncFrequency === "time" && styles.radioSelected]}>
                      {syncFrequency === "time" && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>指定時刻</Text>
                  </TouchableOpacity>
                </View>

                {syncFrequency === "time" && (
                  <View style={styles.row}>
                    <Text style={styles.label}>同期時刻</Text>
                    {Platform.OS === "web" ? (
                      <Text style={styles.value}>
                        時刻選択はネイティブ環境でのみ利用可能です
                      </Text>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.timeButton}
                          onPress={() => setShowTimePicker(true)}
                        >
                          <Text style={styles.timeButtonText}>
                            {formatTime(syncTime)}
                          </Text>
                        </TouchableOpacity>
                        {showTimePicker && (
                          <DateTimePicker
                            value={syncTime}
                            mode="time"
                            is24Hour={true}
                            display="default"
                            onChange={handleTimeChange}
                          />
                        )}
                      </>
                    )}
                  </View>
                )}

                <Text style={styles.note}>
                  {syncFrequency === "none"
                    ? "手動で同期ボタンを押した時のみ作業員リストを更新します"
                    : syncFrequency === "hourly"
                    ? "1時間ごとに自動的に作業員リストを更新します"
                    : "指定した時刻に自動的に作業員リストを更新します"}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* セキュリティ設定 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>セキュリティ</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>パスコードロック</Text>
              <Switch
                value={isPasscodeEnabled}
                onValueChange={handlePasscodeToggle}
                trackColor={{
                  false: tokens.color.border.default,
                  true: tokens.color.primary,
                }}
              />
            </View>
            {isPasscodeEnabled && (
              <Text style={styles.note}>
                アプリ起動時にパスコードが要求されます
              </Text>
            )}
          </View>
        </View>

        {/* アプリ情報 & EAS Update */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>アプリ情報</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>バージョン</Text>
              <Text style={styles.value}>{updateInfo.currentVersion}</Text>
            </View>

            {/* デバッグ情報: production では非表示 */}
            {(Constants.expoConfig?.extra?.appEnv || "development") !== "production" && (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Face API URL</Text>
                  <Text style={[styles.value, styles.monospace]} numberOfLines={2}>
                    {Constants.expoConfig?.extra?.apiFaceApi || "未設定"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>GS API URL</Text>
                  <Text style={[styles.value, styles.monospace]} numberOfLines={2}>
                    {Constants.expoConfig?.extra?.apiBaseGs || "未設定"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Auth Issuer</Text>
                  <Text style={[styles.value, styles.monospace]} numberOfLines={2}>
                    {Constants.expoConfig?.extra?.authIssuer || "未設定"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Auth Audience</Text>
                  <Text style={[styles.value, styles.monospace]} numberOfLines={1}>
                    {Constants.expoConfig?.extra?.auth?.audience || "未設定"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Auth Client ID</Text>
                  <Text style={[styles.value, styles.monospace]} numberOfLines={1}>
                    {Constants.expoConfig?.extra?.auth?.clientId || "未設定"}
                  </Text>
                </View>
              </>
            )}

            {Updates.isEnabled ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Update ID</Text>
                  <Text style={[styles.value, styles.monospace]} numberOfLines={1}>
                    {updateInfo.updateId?.slice(0, 8) || "埋め込みビルド"}
                  </Text>
                </View>

                {updateInfo.createdAt && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Update日時</Text>
                    <Text style={styles.value}>
                      {new Date(updateInfo.createdAt).toLocaleString("ja-JP")}
                    </Text>
                  </View>
                )}

                <View style={styles.row}>
                  <Text style={styles.label}>配信チャンネル</Text>
                  <Text style={styles.value}>{updateInfo.channel || "デフォルト"}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>起動モード</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      !updateInfo.isEmbeddedLaunch && styles.statusBadgeConnected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        !updateInfo.isEmbeddedLaunch && styles.statusTextConnected,
                      ]}
                    >
                      {updateInfo.isEmbeddedLaunch ? "埋め込み" : "OTA Update"}
                    </Text>
                  </View>
                </View>

                <View style={styles.buttonRow}>
                  <Button
                    title="アップデート確認"
                    variant="secondary"
                    onPress={checkForUpdates}
                    loading={isCheckingUpdates}
                    disabled={isCheckingUpdates}
                    fullWidth
                  />
                </View>

                <Text style={styles.note}>
                  {updateInfo.isEmbeddedLaunch
                    ? "APKに埋め込まれたコードで起動しています"
                    : "EAS Updateで配信されたコードで起動しています"}
                </Text>
              </>
            ) : (
              <Text style={styles.note}>開発モードで実行中（EAS Update無効）</Text>
            )}
          </View>
        </View>

        {/* 作業員マスタ管理 */}
        {Platform.OS !== "web" && workersReady && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>作業員マスタ管理</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.label}>登録済み作業員</Text>
                <Text style={styles.value}>{workerCount}名</Text>
              </View>

              <View style={styles.buttonRow}>
                <Button
                  title={isSyncing ? "同期中..." : "サーバーから同期"}
                  variant="primary"
                  onPress={handleWorkerSync}
                  loading={isSyncing}
                  disabled={isSyncing}
                  fullWidth
                />
              </View>

              <Text style={styles.note}>
                サーバーから最新の作業員マスタを取得します。顔認証機能を使用する場合は、事前に同期が必要です。
              </Text>
            </View>
          </View>
        )}

        {/* BLE設定 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BLEカードリーダー</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>接続状態</Text>
              <View style={[styles.statusBadge, bleConnected && styles.statusBadgeConnected]}>
                <Text style={[styles.statusText, bleConnected && styles.statusTextConnected]}>
                  {bleConnected ? "接続中" : "未接続"}
                </Text>
              </View>
            </View>

            {bleConnected && bleDeviceInfo ? (
              <View style={styles.row}>
                <Text style={styles.label}>デバイス情報</Text>
                <Text style={styles.value}>{bleDeviceInfo}</Text>
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              {bleConnected ? (
                <Button
                  title="切断"
                  variant="secondary"
                  onPress={handleBleDisconnect}
                  fullWidth
                />
              ) : (
                <Button
                  title="接続"
                  variant="primary"
                  onPress={handleBleConnect}
                  loading={bleConnecting}
                  disabled={bleConnecting}
                  fullWidth
                />
              )}
            </View>
          </View>
        </View>

        {/* アクション */}
        <View style={styles.section}>
          <Button
            title="ログアウト"
            variant="danger"
            onPress={handleLogout}
            fullWidth
          />
        </View>
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.paper,
  },

  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xl,
  },

  section: {
    gap: tokens.spacing.md,
  },

  sectionTitle: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  card: {
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
    ...tokens.shadow.sm,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  disabled: {
    opacity: 0.5,
  },

  label: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.primary,
  },

  value: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
  },

  monospace: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },

  note: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
    marginTop: tokens.spacing.xs,
  },

  statusBadge: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.border.default,
  },

  statusBadgeConnected: {
    backgroundColor: tokens.color.success + "20",
  },

  statusText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.secondary,
  },

  statusTextConnected: {
    color: tokens.color.success,
  },

  buttonRow: {
    marginTop: tokens.spacing.sm,
  },

  radioGroup: {
    gap: tokens.spacing.sm,
    marginVertical: tokens.spacing.sm,
  },

  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: tokens.spacing.sm,
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.color.border.default,
    justifyContent: "center",
    alignItems: "center",
    marginRight: tokens.spacing.sm,
  },

  radioSelected: {
    borderColor: tokens.color.primary,
  },

  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.color.primary,
  },

  radioLabel: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.primary,
  },

  timeButton: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.background.paper,
    borderWidth: 1,
    borderColor: tokens.color.border.default,
  },

  timeButtonText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.primary,
    fontWeight: tokens.font.weight.semibold,
  },

  // プロジェクト選択モーダル
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContent: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.xl,
    ...tokens.shadow.lg,
  },

  modalTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text.primary,
    marginBottom: tokens.spacing.sm,
  },

  modalSubtitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.lg,
  },

  projectList: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.lg,
  },

  projectItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: tokens.color.border.default,
    backgroundColor: tokens.color.background.paper,
  },

  projectItemSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary + "10",
  },

  projectInfo: {
    flex: 1,
  },

  projectId: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.xs,
  },

  projectIdSelected: {
    color: tokens.color.primary,
  },

  projectName: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },

  projectNameSelected: {
    color: tokens.color.primary,
  },

  selectedBadge: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primary,
  },

  selectedBadgeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semibold,
    color: "#fff",
  },

  modalActions: {
    gap: tokens.spacing.sm,
  },
});
