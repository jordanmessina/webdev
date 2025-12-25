import path from "path";
import os from "os";

export const config = {
  appName: process.env.APP_NAME || "WebDev",
  port: parseInt(process.env.PORT || "3000", 10),
  sessionsPath:
    process.env.SESSIONS_PATH?.replace("~", os.homedir()) ||
    path.join(os.homedir(), ".webdev", "sessions.json"),
  browseRoot: process.env.BROWSE_ROOT || "/",
};
