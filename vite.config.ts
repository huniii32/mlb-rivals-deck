import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 외부 공개 전제: WEB_HOST=0.0.0.0 으로 실행하면 같은 공유기/서버에서 접속 가능.
// WEB_ALLOWED_HOSTS에 배포 도메인을 쉼표로 넣는다.
const allowedHosts = [
  "localhost",
  "127.0.0.1",
  ...(process.env.WEB_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
];

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
  server: {
    host: process.env.WEB_HOST || "127.0.0.1",
    port: Number(process.env.WEB_PORT || 5176),
    allowedHosts,
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.WEB_PORT || 4174),
  },
});
