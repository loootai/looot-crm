import next from "eslint-config-next/core-web-vitals";

const config = [{ ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/**"] }, ...next];
export default config;
