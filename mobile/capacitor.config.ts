import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.azgaar.fmg.mobile",
  appName: "FMG Mobile",
  webDir: "dist",
  // the pairing server is plain http on the LAN: a native webview needs cleartext permission
  server: { androidScheme: "https", cleartext: true }
};

export default config;
