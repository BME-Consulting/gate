import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

async function checkUpdate() {
  console.log("=== Update Check Debug ===");
  console.log("Channel:", Updates.channel);
  console.log("Runtime Version:", Updates.runtimeVersion);
  console.log("Update ID:", Updates.updateId);
  console.log("Is Embedded Launch:", Updates.isEmbeddedLaunch);
  console.log("Constants.expoConfig.extra:", JSON.stringify(Constants.expoConfig?.extra, null, 2));
  
  try {
    const update = await Updates.checkForUpdateAsync();
    console.log("Update available:", update.isAvailable);
    console.log("Manifest:", update.manifest);
  } catch (error) {
    console.error("Error checking update:", error);
  }
}

checkUpdate();
