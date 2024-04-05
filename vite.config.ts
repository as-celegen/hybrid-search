import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
    process.env = {...process.env, ...loadEnv(mode, process.cwd(), '')};
    return {
        resolve: {
            alias: {
                '@': "/src",
            },
        },
    };
})